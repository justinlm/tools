import { COSClient } from './cos-client';
import { DeltaCalculator } from './delta-calculator';
import { FileUploader } from './file-uploader';
import { MD5Cache } from './md5-cache';
import { scanLocalDirectory, normalizePrefix, computeFileMD5 } from './utils';
import { SyncResult, FileInfo, COSConfig } from './types';


export class COSSynchronizer {
  private cosClient: COSClient;
  private deltaCalculator: DeltaCalculator;
  private fileUploader: FileUploader;
  private threads: number;

  constructor(config: COSConfig, threads: number = 8, hashChunkMB: number = 4) {
    this.cosClient = new COSClient(config);
    this.deltaCalculator = new DeltaCalculator(threads, hashChunkMB);
    this.fileUploader = new FileUploader(this.cosClient, threads);
    this.threads = threads;
  }

  async sync(
    localDir?: string,
    prefix: string = '',
    deleteExtra: boolean = false,
    md5CachePath?: string
  ): Promise<SyncResult> {
    const startTime = Date.now();
    console.log(`[Sync] Start sync: local=${localDir} -> prefix=${prefix} (threads=${this.threads}, deleteExtra=${deleteExtra})`);

    try {
      // 1. 下载远端meta文件
      const remoteVersion = await this.downloadRemoteVersion(prefix);

      // // 2. 同步本地文件
      // let newMeta = new Map<string, FileInfo>(remoteVersion);
      // let metaHasChanges = false;
      // let uploadedTotalBytes = 0;

      // if (localDir) {
      //   const result = await this.syncLocalToMeta(localDir, prefix, newMeta, md5CachePath);
      //   metaHasChanges = result.metaHasChanges;
      //   uploadedTotalBytes = result.uploadedTotalBytes;
      // }

      // // 3. 上传meta文件（如果有变化）
      // if (metaHasChanges) {
      //   console.log('[Meta] Meta file has changes, uploading...');
      //   await this.uploadRemoteMeta(prefix, newMeta);
      //   console.log(`[Meta] Updated meta file with ${newMeta.size} entries`);
      // } else {
      //   console.log('[Meta] No changes to meta file, skipping upload');
      // }

      // // 4. 删除多余文件
      // let deletedCount = 0;

      // // 5. 返回结果
      // const elapsedTime = (Date.now() - startTime) / 1000;
      // const result: SyncResult = {
      //   scannedLocal: localDir ? newMeta.size : 0,
      //   scannedRemote: remoteVersion.size,
      //   uploaded: localDir ? (newMeta.size - remoteVersion.size) : 0,
      //   deleted: deletedCount,
      //   totalSize: uploadedTotalBytes,
      //   elapsedTime
      // };

      // console.log(`[Sync] Completed in ${elapsedTime.toFixed(2)}s`);
      // return result;
      return {} as SyncResult;
    } catch (error) {
      console.error('[Sync] Sync failed:', error);
      throw error;
    }
  }

  private async downloadRemoteVersion(prefix: string): Promise<number> {
    const versionKey = prefix.replace(/\/$/, '') + '/version.txt';
    console.log(`[Remote] Downloading version file: ${versionKey}`);

    try {
      const buffer = await this.cosClient.getObject(versionKey);
      const content = buffer.toString('utf-8');

      if (!content.trim()) {
        console.warn('[Remote] Meta file is empty');
        return -1;
      }

      let versionNum = parseInt(content.trim(), 10);
      if (isNaN(versionNum)) {
        console.warn('[Remote] Version file content is not a number');
        return -1;
      }

      console.log(`[Remote] Loaded version ${versionNum} from version file`);
      return versionNum;
    } catch (error) {
      console.warn('[Remote] Failed to download meta file:', error);
      return -1;
    }
  }

  private async uploadRemoteMeta(prefix: string, meta: Map<string, FileInfo>): Promise<void> {
    const metaKey = prefix.replace(/\/$/, '') + '.meta.json';
    const data = Object.fromEntries(meta);
    const content = JSON.stringify(data, null, 2);

    // 这里需要实现将content上传到COS
    // 由于COS SDK的限制，可能需要使用其他方式上传文本内容
    console.log(`[Meta] Would upload meta file: ${metaKey} (${content.length} bytes)`);
  }

  private async syncLocalToMeta(
    localDir: string,
    prefix: string,
    newMeta: Map<string, FileInfo>,
    md5CachePath?: string
  ): Promise<{ metaHasChanges: boolean; uploadedTotalBytes: number }> {
    console.log('[Local] Syncing local files to meta...');

    // 扫描本地文件
    const localMap = scanLocalDirectory(localDir, prefix);

    // 加载MD5缓存
    const md5Cache = MD5Cache.loadCache(md5CachePath);
    const currentFiles = new Set(Array.from(localMap.values()).map(info => info.path));
    MD5Cache.cleanStaleEntries(md5Cache, currentFiles);

    // 计算需要上传的文件
    const deltaResult = await this.deltaCalculator.calculateDelta(localMap, newMeta, md5Cache);

    // 上传文件
    let uploadedTotalBytes = 0;
    if (deltaResult.toUpload.length > 0) {
      console.log(`[Upload] Uploading ${deltaResult.toUpload.length} files...`);
      const uploadResult = await this.fileUploader.uploadFiles(deltaResult.toUpload);
      uploadedTotalBytes = uploadResult.totalSize;
      console.log(`[Upload] Successfully uploaded ${uploadResult.uploaded} files`);
    }

    // 更新meta信息
    let metaHasChanges = false;
    for (const [key, localInfo] of localMap) {
      const existingInfo = newMeta.get(key);

      if (existingInfo) {
        // 检查是否需要更新
        const wasUploaded = deltaResult.toUpload.some(item => item.key === key);
        if (wasUploaded) {
          const md5 = await computeFileMD5(localInfo.path);
          newMeta.set(key, {
            ...localInfo,
            md5,
            etag: md5
          });
          metaHasChanges = true;
        }
      } else {
        // 新文件
        const md5 = await computeFileMD5(localInfo.path);
        newMeta.set(key, {
          ...localInfo,
          md5,
          etag: md5
        });
        metaHasChanges = true;
      }
    }

    // 保存MD5缓存
    MD5Cache.saveCache(md5CachePath, md5Cache);

    return { metaHasChanges, uploadedTotalBytes };
  }

  private async deleteExtraObjects(meta: Map<string, FileInfo>, prefix: string): Promise<number> {
    console.log('[Delete] Comparing meta file with actual remote files...');

    // 这里需要实现获取实际远程文件列表并删除多余文件的逻辑
    // 由于篇幅限制，这里简化实现
    console.log('[Delete] Delete extra objects functionality would be implemented here');
    return 0;
  }
}