import { computeFileMD5, cacheKeyForPath } from './utils';
import { MD5Cache } from './md5-cache';
import { FileInfo, DeltaResult } from './types';

export class DeltaCalculator {
  private threads: number;
  private hashChunkBytes: number;
  
  constructor(threads: number = 8, hashChunkMB: number = 4) {
    this.threads = threads;
    this.hashChunkBytes = hashChunkMB * 1024 * 1024;
  }
  
  async calculateDelta(
    localMap: Map<string, FileInfo>,
    remoteMeta: Map<string, FileInfo>,
    md5Cache: Map<string, string>
  ): Promise<DeltaResult> {
    console.log('[Diff] Calculating delta...');
    
    const toUpload: Array<{ key: string; path: string }> = [];
    let hashedBytes = 0;
    let processed = 0;
    const total = localMap.size;
    
    const processFile = async ([key, localInfo]: [string, FileInfo]): Promise<{ key: string; path: string; needUpload: boolean; hashed: number }> => {
      const remoteInfo = remoteMeta.get(key);
      let needUpload = false;
      let hashed = 0;
      
      try {
        // 大小不同直接上传
        if (!remoteInfo || remoteInfo.size !== localInfo.size) {
          needUpload = true;
        } else {
          // 大小相同，检查MD5
          const cacheKey = cacheKeyForPath(localInfo.path);
          let localMD5 = md5Cache.get(cacheKey);
          
          if (!localMD5) {
            localMD5 = await computeFileMD5(localInfo.path, this.hashChunkBytes);
            md5Cache.set(cacheKey, localMD5);
            hashed = localInfo.size;
          }
          
          const remoteMD5 = remoteInfo.md5;
          const remoteETag = remoteInfo.etag;
          const isMultipart = remoteETag && remoteETag.includes('-');
          
          if (remoteMD5 && remoteMD5 !== localMD5) {
            needUpload = true;
          } else if (remoteETag && !isMultipart && remoteETag !== localMD5) {
            needUpload = true;
          } else if (!remoteMD5 && !remoteETag) {
            needUpload = true;
          }
        }
      } catch (error) {
        console.warn(`Error processing ${key}:`, error);
        needUpload = true;
      }
      
      processed++;
      hashedBytes += hashed;
      
      if (processed % 10 === 0 || processed === total) {
        const progress = ((processed / total) * 100).toFixed(1);
        console.log(`[Diff] Progress: ${processed}/${total} (${progress}%)`);
      }
      
      return { key, path: localInfo.path, needUpload, hashed };
    };
    
    // 使用Promise.all进行并发处理
    const entries = Array.from(localMap.entries());
    const batchSize = Math.ceil(entries.length / this.threads);
    const batches: Array<Array<[string, FileInfo]>> = [];
    
    for (let i = 0; i < entries.length; i += batchSize) {
      batches.push(entries.slice(i, i + batchSize));
    }
    
    for (const batch of batches) {
      const results = await Promise.all(batch.map(processFile));
      
      for (const result of results) {
        if (result.needUpload) {
          toUpload.push({ key: result.key, path: result.path });
        }
      }
    }
    
    console.log(`[Diff] To upload: ${toUpload.length} files`);
    return { toUpload, hashedBytes };
  }
}