# 使用 pip 安装sdk：pip install -U cos-python-sdk-v5 tencentcloud-sdk-python-intl-en

# -*- coding=utf-8
from qcloud_cos import CosConfig, CosS3Client
from tencentcloud.teo.v20220901 import teo_client, models
from tencentcloud.common import credential
import sys
import logging
import os
import hashlib
import threading
import json
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Tuple, Optional, Set
from dataclasses import dataclass

# 配置日志系统
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

# 降低第三方库日志噪声，仅保留我们自己的总进度 INFO
for _name in (
    'qcloud_cos',
    'urllib3',
    'tencentcloud',
    'tencentcloud_sdk_common',
    'requests',
):
    try:
        logging.getLogger(_name).setLevel(logging.WARNING)
    except Exception:
        pass

# 增加连接池大小以支持高并发上传
import requests.adapters
requests.adapters.DEFAULT_POOLSIZE = 32

# 配置类
@dataclass
class SyncConfig:
    """同步配置参数"""
    CHUNK_SIZE_MB: int = 4
    PROGRESS_LOG_INTERVAL: float = 1.0
    META_FILE_SUFFIX: str = '.meta.json'
    CACHE_CHUNK_SIZE: int = 8192

# 全局配置
config = SyncConfig()

# COS 配置
secret_id = 'IKIDMispiXEsBUggT7Z5RaWFn9yQgV8ZmmZE'
secret_key = 'd2EC0bz96yTmslRtFPNCpFSSEnBUbUGr'
region = 'ap-singapore'
token = None
BUCKET = 'h5-res-1323539502'

cos_config = CosConfig(Region=region, SecretId=secret_id, SecretKey=secret_key, Token=token)
client = CosS3Client(cos_config)

# 自定义异常
class SyncError(Exception):
    """同步操作异常"""
    pass

# 工具函数
def _normalize_prefix(prefix: str) -> str:
    """标准化前缀，确保以 / 结尾"""
    if not prefix:
        return ''
    return prefix if prefix.endswith('/') else prefix + '/'

def _format_size(num_bytes: int) -> str:
    """格式化文件大小为人类可读格式"""
    try:
        n = float(num_bytes)
    except (ValueError, TypeError):
        n = 0.0

    units = ['B', 'KB', 'MB', 'GB', 'TB']
    idx = 0
    while n >= 1024.0 and idx < len(units) - 1:
        n /= 1024.0
        idx += 1

    return f"{n:.2f} {units[idx]}"

def _cache_key_for_path(path: str) -> str:
    """为文件路径生成缓存键"""
    try:
        stat = os.stat(path)
        return f"{path}|{int(stat.st_mtime)}|{stat.st_size}"
    except OSError:
        return f"{path}|0|0"

# 文件操作类
class FileScanner:
    """文件扫描器"""

    @staticmethod
    def scan_local_directory(local_dir: str, prefix: str) -> Dict[str, Dict[str, any]]:
        """扫描本地目录，返回文件映射"""
        logger.info(f'[Local] Scanning directory: {local_dir}')
        local_map = {}
        prefix_norm = _normalize_prefix(prefix)
        base = os.path.abspath(local_dir)

        for root, dirs, files in os.walk(base):
            for fname in files:
                local_path = os.path.join(root, fname)
                rel_path = os.path.relpath(local_path, base).replace('\\', '/')
                key = prefix_norm + rel_path
                local_map[key] = {
                    'path': local_path,
                    'size': os.path.getsize(local_path)
                }

        logger.info(f'[Local] Found {len(local_map)} files')
        return local_map

class MetaFileManager:
    """Meta 文件管理器"""

    @staticmethod
    def download_remote_meta(prefix: str) -> Dict[str, Dict[str, any]]:
        """下载远端元数据文件"""
        meta_key = prefix.rstrip('/') + config.META_FILE_SUFFIX
        logger.info(f'[Remote] Downloading meta file: {meta_key}')

        # 检查文件是否存在
        try:
            resp = client.list_objects(Bucket=BUCKET, Prefix=meta_key, MaxKeys=1)
            if not resp.get('Contents'):
                logger.info(f'[Remote] Meta file does not exist: {meta_key}')
                return {}
        except Exception as e:
            logger.error(f'[Remote] Failed to check meta file {meta_key}: {e}')
            return {}

        # 下载文件内容
        try:
            resp = client.get_object(Bucket=BUCKET, Key=meta_key)
            content_parts = []
            while True:
                chunk = resp['Body'].read(config.CACHE_CHUNK_SIZE)
                if not chunk:
                    break
                content_parts.append(chunk)

            content_bytes = b''.join(content_parts)
            content = content_bytes.decode('utf-8')
            logger.info(f'[Remote] Meta file size: {len(content)} bytes')

            if not content.strip():
                logger.warning('[Remote] Meta file is empty')
                return {}

            data = json.loads(content)
            if not isinstance(data, dict):
                logger.warning('[Remote] Meta file content is not a dict')
                return {}

            logger.info(f'[Remote] Loaded {len(data)} entries from meta file')
            return data

        except json.JSONDecodeError as e:
            logger.error(f'[Remote] JSON parse error in meta file {meta_key}: {e}')
            logger.error(f'[Remote] Content preview: {content[:200]}...')
            return {}
        except Exception as e:
            logger.error(f'[Remote] Failed to download meta file {meta_key}: {e}')
            return {}

    @staticmethod
    def upload_remote_meta(prefix: str, meta_dict: Dict[str, Dict[str, any]]) -> bool:
        """上传远端元数据文件"""
        meta_key = prefix.rstrip('/') + config.META_FILE_SUFFIX
        logger.info(f'[Meta] Uploading meta file: {meta_key}')

        try:
            content = json.dumps(meta_dict, separators=(',', ':'))
            logger.info(f'[Meta] Meta content size: {len(content)} bytes')

            # 使用临时文件进行分片上传
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', delete=False) as f:
                f.write(content)
                temp_path = f.name

            try:
                client.upload_file(
                    Bucket=BUCKET,
                    LocalFilePath=temp_path,
                    Key=meta_key,
                    PartSize=1,  # 1MB 分片
                    MAXThread=1,  # 单线程上传
                    Metadata={'md5': hashlib.md5(content.encode('utf-8')).hexdigest()}
                )
                logger.info(f'[Meta] Updated meta file with {len(meta_dict)} entries')
                return True
            finally:
                # 清理临时文件
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass

        except Exception as e:
            logger.error(f'[Meta] Upload failed: {e}')
            return False

class MD5Cache:
    """MD5 缓存管理器"""

    @staticmethod
    def load_cache(cache_path: Optional[str]) -> Dict[str, str]:
        """加载 MD5 缓存"""
        if not cache_path:
            return {}

        try:
            if not os.path.isfile(cache_path):
                return {}

            with open(cache_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data if isinstance(data, dict) else {}
        except Exception as e:
            logger.warning(f'[Cache] Failed to load cache: {e}')
            return {}

    @staticmethod
    def save_cache(cache_path: Optional[str], cache_dict: Dict[str, str]) -> None:
        """保存 MD5 缓存"""
        if not cache_path:
            return

        try:
            os.makedirs(os.path.dirname(cache_path), exist_ok=True)
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(cache_dict, f)
        except Exception as e:
            logger.warning(f'[Cache] Failed to save cache: {e}')

    @staticmethod
    def clean_stale_entries(cache_dict: Dict[str, str], current_files: Set[str]) -> int:
        """清理缓存中的过期条目"""
        if not cache_dict:
            return 0

        keys_to_remove = []
        for cache_key in cache_dict.keys():
            file_path = cache_key.split('|')[0]
            if file_path not in current_files:
                keys_to_remove.append(cache_key)

        for key in keys_to_remove:
            del cache_dict[key]

        if keys_to_remove:
            logger.info(f'[Cache] Cleaned {len(keys_to_remove)} stale entries from cache')

        return len(keys_to_remove)

class MD5Calculator:
    """MD5 计算器"""

    @staticmethod
    def compute_file_md5(local_path: str, chunk_size: int = 1024 * 1024) -> str:
        """计算文件 MD5"""
        hasher = hashlib.md5()
        with open(local_path, 'rb') as f:
            while True:
                data = f.read(chunk_size)
                if not data:
                    break
                hasher.update(data)
        return hasher.hexdigest()

class DeltaCalculator:
    """差异计算器"""

    def __init__(self, threads: int, hash_chunk_mb: int):
        self.threads = threads
        self.hash_chunk_bytes = max(1, int(hash_chunk_mb)) * 1024 * 1024
        self.progress = {
            'total': 0,
            'done': 0,
            'hashed_bytes': 0,
            'lock': threading.Lock(),
            'last_log': time.time()
        }

    def calculate_delta(
        self,
        local_map: Dict[str, Dict[str, any]],
        remote_meta: Dict[str, Dict[str, any]],
        md5_cache: Dict[str, str]
    ) -> List[Tuple[str, str]]:
        """计算需要上传的文件列表"""
        logger.info('[Diff] Calculating delta ...')

        remote_map = {k: v.get('size', 0) for k, v in remote_meta.items()}
        items = [
            (k, v['path'], int(v['size']), int(remote_map[k]) if k in remote_map else None)
            for k, v in local_map.items()
        ]

        self.progress['total'] = len(items)
        self.progress['done'] = 0
        self.progress['hashed_bytes'] = 0

        to_upload = []

        def _get_local_md5(local_path: str) -> str:
            cache_key = _cache_key_for_path(local_path)
            if cache_key in md5_cache:
                return md5_cache[cache_key]
            md5v = MD5Calculator.compute_file_md5(local_path, self.hash_chunk_bytes)
            md5_cache[cache_key] = md5v
            return md5v

        def _decide_upload(key: str, local_path: str, local_size: int, remote_size: Optional[int]) -> Tuple[bool, int]:
            if remote_size is None or remote_size != local_size:
                return True, 0

            # 大小相同，精准校验
            remote_info = remote_meta.get(key, {})
            md5_meta = remote_info.get('md5')
            etag = remote_info.get('etag')
            is_multipart = ('-' in etag) if etag else None

            local_md5 = _get_local_md5(local_path)
            hashed = local_size

            if md5_meta:
                return (md5_meta != local_md5), hashed
            if etag and not is_multipart:
                return (etag != local_md5), hashed

            return True, hashed

        def _worker(tup: Tuple[str, str, int, Optional[int]]) -> Tuple[str, str, bool]:
            key, path, lsize, rsize = tup
            try:
                need, hashed = _decide_upload(key, path, lsize, rsize)
            except Exception as e:
                logger.warning(f'[Diff] Error processing {key}: {e}')
                need, hashed = True, 0
            finally:
                with self.progress['lock']:
                    self.progress['done'] += 1
                    self.progress['hashed_bytes'] += hashed
                    now = time.time()
                    if now - self.progress['last_log'] >= config.PROGRESS_LOG_INTERVAL:
                        self.progress['last_log'] = now
                        logger.info(f'[Diff] Progress: {self.progress["done"]}/{self.progress["total"]} '
                                  f'(hashed {_format_size(self.progress["hashed_bytes"])})')
            return (key, path, need)

        if items:
            with ThreadPoolExecutor(max_workers=self.threads) as executor:
                for key, path, need in executor.map(_worker, items):
                    if need:
                        to_upload.append((key, path))
            # 计算结束后补打 100% 进度行
            with self.progress['lock']:
                self.progress['last_log'] = time.time()
                logger.info(f"[Diff] Progress: {self.progress['total']}/{self.progress['total']} "
                            f"(hashed {_format_size(self.progress['hashed_bytes'])})")

        logger.info(f'[Diff] To upload: {len(to_upload)} files')
        return to_upload

class FileUploader:
    """文件上传器"""

    def __init__(self, threads: int):
        self.threads = threads
        self.progress = {
            'total_bytes': 0,
            'uploaded_bytes': 0,
            'lock': threading.Lock(),
            'last_log': time.time(),
            'last_line_len': 0
        }

    def _print_progress_inline(self, progress_pct: float) -> None:
        """在同一行打印上传进度（覆盖刷新）。"""
        try:
            msg = (f"[Upload] Progress: {progress_pct:.0f}% "
                   f"({_format_size(self.progress['uploaded_bytes'])} / "
                   f"{_format_size(self.progress['total_bytes'])})")
            line = '\r' + msg
            # 处理覆盖旧行残留字符
            pad = max(0, self.progress.get('last_line_len', 0) - len(msg))
            if pad:
                line += ' ' * pad
            sys.stdout.write(line)
            sys.stdout.flush()
            self.progress['last_line_len'] = len(msg)
        except Exception:
            # 回退到正常日志
            logger.info(
                f"[Upload] Progress: {progress_pct:.0f}% "
                f"({_format_size(self.progress['uploaded_bytes'])} / "
                f"{_format_size(self.progress['total_bytes'])})"
            )

    def upload_files(self, to_upload: List[Tuple[str, str]]) -> Dict[str, any]:
        """上传文件列表"""
        if not to_upload:
            logger.info('[Upload] No files to upload')
            return {'uploaded': 0, 'total_size': 0}

        # 分离 .version 文件和其他文件
        non_version = [(k, p) for (k, p) in to_upload if not k.endswith('.version')]
        version_files = [(k, p) for (k, p) in to_upload if k.endswith('.version')]

        # 计算整体与批次大小
        overall_total_size = sum(os.path.getsize(p) for _, p in to_upload)
        non_version_total_size = sum(os.path.getsize(p) for _, p in non_version) if non_version else 0
        version_total_size = sum(os.path.getsize(p) for _, p in version_files) if version_files else 0

        logger.info(f'[Upload] Total size to upload: {_format_size(overall_total_size)}')

        # 先上传非 .version 文件
        uploaded_overall = 0
        if non_version:
            logger.info(f'[Upload] Non-.version files: {len(non_version)} (parallel {self.threads})')
            # 将进度分母设置为该批次大小
            self.progress['total_bytes'] = non_version_total_size
            self.progress['uploaded_bytes'] = 0
            self.progress['last_line_len'] = 0
            uploaded_overall += self._upload_file_batch(non_version)

        # 再上传 .version 文件
        if version_files:
            logger.info(f'[Upload] .version files: {len(version_files)} (parallel {self.threads})')
            # 将进度分母设置为该批次大小
            self.progress['total_bytes'] = version_total_size
            self.progress['uploaded_bytes'] = 0
            self.progress['last_line_len'] = 0
            uploaded_overall += self._upload_file_batch(version_files)

        return {'uploaded': len(to_upload), 'total_size': uploaded_overall}

    def _upload_file_batch(self, file_batch: List[Tuple[str, str]]) -> int:
        """批量上传文件，返回本批成功上传的总字节数"""
        uploaded_sum = 0
        def _upload_single_file(key_path: Tuple[str, str]) -> int:
            key, local_path = key_path
            try:
                file_size = os.path.getsize(local_path)
                client.upload_file(
                    Bucket=BUCKET,
                    LocalFilePath=local_path,
                    Key=key,
                    PartSize=config.CHUNK_SIZE_MB,
                    MAXThread=1,
                    Metadata={'md5': MD5Calculator.compute_file_md5(local_path)}
                )

                with self.progress['lock']:
                    self.progress['uploaded_bytes'] += file_size
                    now = time.time()
                    if now - self.progress['last_log'] >= config.PROGRESS_LOG_INTERVAL:
                        self.progress['last_log'] = now
                        progress_pct = (self.progress['uploaded_bytes'] / self.progress['total_bytes']) * 100
                        self._print_progress_inline(progress_pct)

                return file_size
            except Exception as e:
                logger.error(f'[Upload] Failed to upload {key}: {e}')
                return 0

        with ThreadPoolExecutor(max_workers=self.threads) as executor:
            for sz in executor.map(_upload_single_file, file_batch):
                uploaded_sum += int(sz or 0)
        # 批次完成，打印最终 100% 并换行，避免后续日志顶在同一行
        with self.progress['lock']:
            if self.progress['total_bytes'] > 0:
                pct = (self.progress['uploaded_bytes'] / self.progress['total_bytes']) * 100
                if pct < 100:
                    pct = 100
                self._print_progress_inline(pct)
                sys.stdout.write('\n')
                sys.stdout.flush()
        return uploaded_sum

# 主要同步类
class COSSynchronizer:
    """COS 同步器主类"""

    def __init__(self, threads: int = 8, hash_chunk_mb: int = 4):
        self.threads = threads
        self.hash_chunk_mb = hash_chunk_mb
        self.delta_calculator = DeltaCalculator(threads, hash_chunk_mb)
        self.file_uploader = FileUploader(threads)

    def sync(self, local_dir: Optional[str], prefix: str, delete_extra: bool = False,
             md5_cache_path: Optional[str] = None) -> Dict[str, any]:
        """执行同步操作"""
        start_time = time.time()
        logger.info(f'[Sync] Start sync: local={local_dir} -> prefix={prefix} '
                   f'(threads={self.threads}, delete_extra={delete_extra})')
        logger.info(f'[Sync] Settings: threads={self.threads}, hash_chunk={self.hash_chunk_mb}MB, '
                   f'md5_cache={bool(md5_cache_path)}')

        try:
            # 1. 下载远端meta文件到内存（不存在则按空数据处理）
            remote_meta = MetaFileManager.download_remote_meta(prefix)

            # 2. 有local参数，同步local信息到meta文件并按需上传
            new_meta = remote_meta.copy() if remote_meta else {}
            meta_has_changes = False
            uploaded_total_bytes = 0

            if local_dir is not None:
                meta_has_changes, uploaded_total_bytes = self._sync_local_to_meta(
                    local_dir, prefix, new_meta, md5_cache_path
                )

            # 3. meta文件有修改则上传，否则跳过
            if meta_has_changes:
                logger.info('[Meta] Meta file has changes, uploading ...')
                MetaFileManager.upload_remote_meta(prefix, new_meta)
                logger.info(f'[Meta] Updated meta file with {len(new_meta)} entries')
            else:
                logger.info('[Meta] No changes to meta file, skipping upload')

            # 4. 有delete参数，则按meta文件与远端实际文件对比处理
            deleted_count = 0
            if delete_extra:
                deleted_count = self._delete_extra_objects_by_meta(new_meta, prefix)

            # 5. 统计结果
            elapsed = time.time() - start_time
            result = {
                'scanned_local': len(new_meta) if local_dir else 0,
                'scanned_remote': len(remote_meta),
                'uploaded': len(new_meta) - len(remote_meta) if local_dir else 0,
                'deleted': deleted_count,
                'total_size': uploaded_total_bytes,
                'elapsed_time': elapsed
            }

            logger.info(f'[Sync] Completed in {elapsed:.2f}s')
            return result

        except Exception as e:
            logger.error(f'[Sync] Sync failed: {e}')
            raise SyncError(f"Sync operation failed: {e}") from e

    def _sync_local_to_meta(self, local_dir: str, prefix: str, new_meta: Dict[str, Dict[str, any]],
                           md5_cache_path: Optional[str]) -> Tuple[bool, int]:
        """同步本地信息到meta文件，返回(是否有变化, 实际上传总字节数)"""
        logger.info('[Local] Syncing local files to meta ...')

        # 扫描本地文件
        local_map = FileScanner.scan_local_directory(local_dir, prefix)

        # 加载MD5缓存
        md5_cache = MD5Cache.load_cache(md5_cache_path)
        current_files = {item['path'] for item in local_map.values()}
        MD5Cache.clean_stale_entries(md5_cache, current_files)

        # 计算需要上传的文件
        to_upload = self.delta_calculator.calculate_delta(local_map, new_meta, md5_cache)

        # 上传文件
        uploaded_total_bytes = 0
        if to_upload:
            logger.info(f'[Upload] Uploading {len(to_upload)} files ...')
            upload_result = self.file_uploader.upload_files(to_upload)
            uploaded_total_bytes = int(upload_result.get('total_size') or 0)
            logger.info(f'[Upload] Successfully uploaded {upload_result["uploaded"]} files')

        # 更新meta文件内容
        meta_has_changes = False
        for key, file_info in local_map.items():
            local_path = file_info['path']

            if key in new_meta:
                # 文件已存在，检查是否需要更新
                if any(k == key for k, _ in to_upload):
                    # 文件被上传，更新meta信息
                    new_meta[key] = {
                        'size': file_info['size'],
                        'md5': MD5Calculator.compute_file_md5(local_path),
                        'etag': MD5Calculator.compute_file_md5(local_path)
                    }
                    meta_has_changes = True
                # 文件未修改，保持原有meta信息
            else:
                # 新文件，添加到meta
                new_meta[key] = {
                    'size': file_info['size'],
                    'md5': MD5Calculator.compute_file_md5(local_path),
                    'etag': MD5Calculator.compute_file_md5(local_path)
                }
                meta_has_changes = True

        # 保存MD5缓存
        MD5Cache.save_cache(md5_cache_path, md5_cache)

        return meta_has_changes, uploaded_total_bytes

    def _delete_extra_objects_by_meta(self, meta_dict: Dict[str, Dict[str, any]],
                                    prefix: str) -> int:
        """按meta文件与远端实际文件对比处理删除"""
        logger.info('[Delete] Comparing meta file with actual remote files ...')

        # 获取实际存在的远程文件
        try:
            actual_remote_objects = self._get_remote_objects_via_list(prefix)
        except SyncError as e:
            logger.error('[Delete] Abort delete: failed to list remote objects. '
                         'Please check SecretId/SecretKey/Region and local time sync.')
            raise

        # 检查缺失或大小不一致的文件
        missing_files = []
        size_mismatch_files = []

        for key, meta_info in meta_dict.items():
            if key not in actual_remote_objects:
                missing_files.append(key)
            else:
                # 统一大小为整数再比较，避免 '2783' vs 2783 被误判
                try:
                    actual_size = int(actual_remote_objects[key].get('size') or 0)
                except Exception:
                    actual_size = 0
                try:
                    meta_size = int(meta_info.get('size') or 0)
                except Exception:
                    meta_size = 0
                if actual_size != meta_size:
                    size_mismatch_files.append({
                        'key': key,
                        'meta_size': meta_size,
                        'actual_size': actual_size
                    })

        # 报告问题
        if missing_files:
            logger.error(f'[Delete] Missing files in remote (found in meta): {len(missing_files)} files')
            for key in missing_files[:5]:
                logger.error(f'[Delete] Missing: {key}')
            if len(missing_files) > 5:
                logger.error(f'[Delete] ... and {len(missing_files) - 5} more')

        if size_mismatch_files:
            logger.error(f'[Delete] Size mismatch files: {len(size_mismatch_files)} files')
            for item in size_mismatch_files[:5]:
                logger.error(f'[Delete] Size mismatch: {item["key"]} '
                           f'(meta: {item["meta_size"]}, actual: {item["actual_size"]})')
            if len(size_mismatch_files) > 5:
                logger.error(f'[Delete] ... and {len(size_mismatch_files) - 5} more')

        # 如果有问题，抛出异常
        if missing_files or size_mismatch_files:
            error_msg = f"Remote files don't match meta file: {len(missing_files)} missing, {len(size_mismatch_files)} size mismatch"
            raise SyncError(error_msg)

        # 删除多余的文件（实际存在但meta中不存在）
        extra_keys = [k for k in actual_remote_objects.keys()
                     if k not in meta_dict and not k.endswith('.meta.json')]

        deleted_count = 0
        if extra_keys:
            logger.info(f'[Delete] Found {len(extra_keys)} extra objects to delete')
            deleted_keys = self._delete_objects_batch(extra_keys)
            deleted_count = len(deleted_keys)
            logger.info(f'[Delete] Successfully deleted {deleted_count} objects')
        else:
            logger.info('[Delete] No extra objects found')

        return deleted_count


    def _get_remote_objects_via_list(self, prefix: str) -> Dict[str, Dict[str, any]]:
        """通过 list_objects 获取远程对象列表"""
        remote_objects = {}
        marker = None
        prefix_norm = prefix.rstrip('/') + '/'

        while True:
            try:
                # 仅在有有效 marker 时传参，避免传入 None 参与签名
                params = {
                    'Bucket': BUCKET,
                    'Prefix': prefix_norm,
                    'MaxKeys': 1000,
                }
                if marker:
                    params['Marker'] = marker

                resp = client.list_objects(**params)

                contents = resp.get('Contents') or []
                for obj in contents:
                    key = obj['Key']
                    remote_objects[key] = {
                        'size': obj['Size'],
                        'etag': obj['ETag'].strip('"'),
                        'last_modified': obj['LastModified']
                    }

                # 检查是否还有更多对象
                is_truncated = bool(resp.get('IsTruncated', False))
                if not is_truncated:
                    break

                # 优先使用 NextMarker，其次回退到最后一个 Key；若都没有则防止死循环直接退出
                next_marker = resp.get('NextMarker')
                if next_marker:
                    marker = next_marker
                elif contents:
                    marker = contents[-1]['Key']
                else:
                    logger.warning('[List] Pagination indicated truncation but no NextMarker/Contents; breaking to avoid loop')
                    break

            except Exception as e:
                logger.error(f'[List] Failed to list objects under prefix "{prefix_norm}": {e}')
                # 抛出异常给上层由调用方决定如何处理（不要把远端当成空集）
                raise SyncError(f'ListObjects failed: {e}')

        logger.info(f'[Delete] Listed {len(remote_objects)} remote objects via list_objects')
        return remote_objects

    def _delete_objects_batch(self, keys: List[str]) -> List[str]:
        """批量删除对象"""
        deleted_keys = []

        for key in keys:
            try:
                client.delete_object(Bucket=BUCKET, Key=key)
                deleted_keys.append(key)
                logger.debug(f'[Delete] Deleted: {key}')
            except Exception as e:
                logger.error(f'[Delete] Failed to delete {key}: {e}')

        return deleted_keys

# 公共 API 函数
def list_folders(prefix: str) -> List[str]:
    """列举单层文件夹"""
    logger.info('[List] Listing one-level folders under prefix ...')
    prefix = _normalize_prefix(prefix)
    resp = client.list_objects(
        Bucket=BUCKET,
        Prefix=prefix,
        Delimiter='/'
    )
    cps = resp.get('CommonPrefixes', [])
    return [cp['Prefix'] for cp in cps]


def sync_local_to_cos(local_dir: Optional[str], prefix: str, delete_extra: bool = False,
                     threads: int = 8, hash_chunk_mb: int = 4,
                     md5_cache_path: Optional[str] = None) -> Dict[str, any]:
    """同步本地目录到 COS（向后兼容接口）"""
    synchronizer = COSSynchronizer(threads, hash_chunk_mb)
    return synchronizer.sync(local_dir, prefix, delete_extra, md5_cache_path)

def flush_edgeone_cache(target: str, zone_id: str):
    # 配置认证信息
    cred = credential.Credential(secret_id, secret_key)
    teo_cli = teo_client.TeoClient(cred, region)

    # 构建请求
    req = models.CreatePurgeTaskRequest()
    req.ZoneId = zone_id
    req.Type = "purge_prefix"
    req.Method = "invalidate"
    req.Targets = [target]

    # 执行刷新
    try:
        resp = teo_cli.CreatePurgeTask(req)
        print(f"\n缓存刷新成功，目标: {target}")
    except Exception as e:
        print(f"\n刷新失败: {str(e)}")

# 主函数
def main():
    """主函数"""
    import argparse

    parser = argparse.ArgumentParser(description='Tencent COS Sync Tool')
    parser.add_argument('--action', choices=['list', 'sync', 'flush'], required=True,
                       help='Action to perform: list folders, sync or flush CDN cache')
    parser.add_argument('--prefix', help='COS prefix for list/sync operations')
    parser.add_argument('--local', help='Local directory path for sync operation')
    parser.add_argument('--delete', action='store_true', help='Delete remote objects not present locally (one-way sync)')
    parser.add_argument('--threads', type=int, default=8, help='Number of threads')
    parser.add_argument('--hash-chunk', type=int, default=4, help='Hash chunk size in MB')
    parser.add_argument('--md5-cache', help='MD5 cache file path')
    # flush
    parser.add_argument('--zone-id', help='EdgeOne ZoneId for flush action')
    parser.add_argument('--target', help='Flush target: URL or prefix, e.g. https://xx/ or https://xx/path/')

    args = parser.parse_args()

    try:
        if args.action == 'list':
            if not args.prefix:
                print("Error: --prefix is required for list action")
                return
            folders = list_folders(args.prefix)
            print("\nFolder list:")
            for folder in folders:
                print(folder)

        elif args.action == 'sync':
            if not args.prefix:
                print("Error: --prefix is required for sync action")
                return

            result = sync_local_to_cos(
                local_dir=args.local,
                prefix=args.prefix,
                delete_extra=args.delete,
                threads=args.threads,
                hash_chunk_mb=args.hash_chunk,
                md5_cache_path=args.md5_cache
            )

            print('Sync done.')
            print(f"Scanned local files: {result['scanned_local']}")
            print(f"Scanned remote objects: {result['scanned_remote']}")
            print(f"Uploaded files: {result['uploaded']}")
            print(f"Deleted objects: {result['deleted']}")
            print(f"Total upload size: {_format_size(result['total_size'])}")

        elif args.action == 'flush':
            if not args.zone_id:
                print('Error: --zone-id is required for flush action')
                return
            if not args.target:
                print('Error: --target is required for flush action')
                return
            flush_edgeone_cache(args.target, zone_id=args.zone_id)

    except Exception as e:
        logger.error(f"Operation failed: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
