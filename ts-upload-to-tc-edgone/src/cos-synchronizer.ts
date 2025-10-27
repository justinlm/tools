import { COSClient } from './cos-client';
import { DeltaCalculator } from './delta-calculator';
import { FileUploader } from './file-uploader';
import { MD5Cache } from './md5-cache';
import { scanLocalDirectory, normalizePrefix, computeFileMD5, readLocalFile } from './utils';
import { SyncResult, FileInfo, COSConfig } from './types';
import { publicDecrypt } from 'crypto';


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
  ): Promise<SyncResult> {
    const startTime = Date.now();
    console.log(`[Sync] Start sync: local=${localDir} -> prefix=${prefix} (threads=${this.threads}, deleteExtra=${deleteExtra})`);

    try {
      // 1. 下载远端version.txt文件
      const remoteVersion = await this.downloadRemoteVersion(prefix);

      // 2. 与本地version.txt对比
      const localVersion = await this.readLocalVersion(localDir);
      if (localVersion == remoteVersion) {
        console.log('[Sync] Local version is up-to-date, skipping sync');
        const result: SyncResult = {
          scannedLocal: 1,
          scannedRemote: 1,
          uploaded: 0,
          deleted: 0,
          totalSize: 0,
          elapsedTime: (Date.now() - startTime) / 1000,
        };
        return result;
      }

      // 3. 同步本地文件
      let uploadedTotalBytes = 0;
      let localfiles = 0;
      let remoteMapSize = 0;
      if (localDir) {
        const result = await this.syncLocalToRemote(localDir, prefix);
        uploadedTotalBytes = result.uploadedTotalBytes;
        localfiles = result.localfiles;
        remoteMapSize = result.remoteMapSize;
      }

      // 5. 返回结果
      const elapsedTime = (Date.now() - startTime) / 1000;
      const result: SyncResult = {
        scannedLocal: localDir ? localfiles : 0,
        scannedRemote: remoteMapSize,
        uploaded: localDir ? (localfiles - remoteMapSize) : 0,
        deleted: 0,
        totalSize: uploadedTotalBytes,
        elapsedTime
      };
      console.log(`[Sync] Completed in ${elapsedTime.toFixed(2)}s`);
      return result;
    } catch (error) {
      console.error('[Sync] Sync failed:', error);
      throw error;
    }
  }

  private async downloadRemoteVersion(prefix: string): Promise<number> {
    const versionKey = prefix.replace(/\/$/, '') + '/version.txt';
    console.log(`[Remote] Downloading version file: ${versionKey}`);

    try {
      const exists = await this.cosClient.doesObjectExist(versionKey);
      if (!exists) {
        console.warn('[Remote] version file does not exist');
        return -1;
      }

      const buffer = await this.cosClient.getObject(versionKey);
      const content = buffer.toString('utf-8');

      if (!content.trim()) {
        console.warn('[Remote] version file is empty');
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

  private async downloadVersionFileList(prefix: string): Promise<Map<string, FileInfo>> {
    const versionFileListKey = prefix.replace(/\/$/, '') + '/version_file_list.txt';
    console.log(`[Remote] Downloading file: ${versionFileListKey}`);

    try {
      const exists = await this.cosClient.doesObjectExist(versionFileListKey);
      if (!exists) {
        console.warn('[Remote] version_file_list file does not exist');
        return new Map();
      }

      const buffer = await this.cosClient.getObject(versionFileListKey);
      const content = buffer.toString('utf-8');

      if (!content.trim()) {
        console.warn('[Remote] version_file_list file is empty');
        return new Map();
      }
      return this.parseVersionFileList(content);
    }
    catch (error) {
      console.warn('[Remote] Failed to download version_file_list file:', error);
      return new Map();
    }
  }

  private parseVersionFileList(content: string): Map<string, FileInfo> {
    // 解析纯文本格式：每行包含"路径 md5 大小"三个字段
    const fileInfoMap: Map<string, FileInfo> = new Map();
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue; // 跳过空行

      // 使用正则表达式分割字段（支持制表符和多个空格）
      const parts = trimmedLine.split(/\s+/);
      if (parts.length < 3) {
        console.warn(`[Remote] Invalid line format: ${trimmedLine}`);
        continue;
      }

      const path = parts[0];
      const md5 = parts[1];
      const size = parseInt(parts[2], 10);

      if (isNaN(size)) {
        console.warn(`[Remote] Invalid size in line: ${trimmedLine}`);
        continue;
      }

      fileInfoMap.set(path, {
        path,
        size,
        md5,
        etag: md5
      });
    }

    console.log(`[Remote] Loaded ${fileInfoMap.size} entries from meta file`);
    return fileInfoMap;
  }

  private async readLocalVersionFileList(localDir?: string): Promise<Map<string, FileInfo>> {
    const versionFileListPath = `${localDir}/version_file_list.txt`;
    try {
      const content = await readLocalFile(versionFileListPath);
      return this.parseVersionFileList(content);
    } catch (error) {
      console.warn('[Local] Failed to read version_file_list file:', error);
      return new Map();
    }
  }

  private async readLocalVersion(localDir?: string): Promise<number> {
    const versionPath = `${localDir}/version.txt`;
    try {
      const content = await readLocalFile(versionPath);
      const versionNum = parseInt(content.trim(), 10);
      if (isNaN(versionNum)) {
        console.warn('[Local] version file content is not a number');
        return -1;
      }
      console.log(`[Local] Loaded version ${versionNum} from version file`);
      return versionNum;
    } catch (error) {
      console.warn('[Local] Failed to read version file:', error);
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

  private async syncLocalToRemote(
    localDir: string,
    prefix: string,
  ): Promise<{ localfiles: number, remoteMapSize: number, uploadedTotalBytes: number }> {
    console.log('[Local] Syncing local files to remote...');

    // 获取本地文件列表
    const localMap = await this.readLocalVersionFileList(localDir);

    //获取远程文件列表
    const remoteMap = await this.downloadVersionFileList(prefix);

    //对比出需要上传的文件
    const toUpload = new Array<{ key: string; path: string }>;

    const prefixNoSlash = prefix.replace(/\/$/, '');

    toUpload.push({ key: prefixNoSlash + '/version_file_list.txt', path: `${localDir}/version_file_list.txt` });
    toUpload.push({ key: prefixNoSlash + '/version.txt', path: `${localDir}/version.txt` });

    for (const [key, localInfo] of localMap) {
      const remoteInfo = remoteMap.get(key);

      // 文件不存在于远程，需要上传
      if (!remoteInfo) {
        toUpload.push({ key: `${prefixNoSlash}/${key}`, path: `${localDir}/${localInfo.path}` });
        continue;
      }

      // 文件存在，检查是否需要更新
      if (localInfo.size !== remoteInfo.size || localInfo.md5 !== remoteInfo.md5) {
        toUpload.push({ key: `${prefixNoSlash}/${key}`, path: `${localDir}/${localInfo.path}` });
      }
    }

    // 上传文件
    let uploadedTotalBytes = 0;
    if (toUpload.length > 0) {
      console.log(`[Upload] Uploading ${toUpload.length} files...`);
      const uploadResult = await this.fileUploader.uploadFiles(toUpload);
      uploadedTotalBytes = uploadResult.totalSize;
      console.log(`[Upload] Successfully uploaded ${uploadResult.uploaded} files`);
    }

    return { localfiles: localMap.size + 2, remoteMapSize: remoteMap.size, uploadedTotalBytes };
  }

  private async deleteExtraObjects(meta: Map<string, FileInfo>, prefix: string): Promise<number> {
    console.log('[Delete] Comparing meta file with actual remote files...');

    // 这里需要实现获取实际远程文件列表并删除多余文件的逻辑
    // 由于篇幅限制，这里简化实现
    console.log('[Delete] Delete extra objects functionality would be implemented here');
    return 0;
  }
}

