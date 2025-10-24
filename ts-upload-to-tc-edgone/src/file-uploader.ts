import { COSClient } from './cos-client';
import { statSync } from 'fs';
import { formatSize } from './utils';
import { UploadProgress } from './types';

export class FileUploader {
  private cosClient: COSClient;
  private threads: number;

  constructor(cosClient: COSClient, threads: number = 8) {
    this.cosClient = cosClient;
    this.threads = threads;
  }

  async uploadFiles(toUpload: Array<{ key: string; path: string }>): Promise<{ uploaded: number; totalSize: number }> {
    if (toUpload.length === 0) {
      console.log('[Upload] No files to upload');
      return { uploaded: 0, totalSize: 0 };
    }

    let totalUploaded = 0;
    let totalSize = 0;

    if (toUpload.length > 0) {
      console.log(`[Upload] Total files: ${toUpload.length} (parallel ${this.threads})`);
      const result = await this.uploadBatch(toUpload);
      totalUploaded += result.uploaded;
      totalSize += result.totalSize;
    }

    return { uploaded: totalUploaded, totalSize };
  }

  private async uploadBatch(files: Array<{ key: string; path: string }>): Promise<{ uploaded: number; totalSize: number }> {
    let uploaded = 0;
    let totalSize = 0;

    const uploadFile = async ({ key, path }: { key: string; path: string }): Promise<number> => {
      try {
        // console.log(`[Upload] Uploading key:${key}: path:(${path})...`);
        const fileSize = statSync(path).size;
        console.log(`[Upload] Uploading ${key} (${formatSize(fileSize)})...`);
        await this.cosClient.uploadFile(path, key);
        uploaded++;
        totalSize += fileSize;

        const progress = ((uploaded / files.length) * 100).toFixed(1);
        console.log(`[Upload] Progress: ${uploaded}/${files.length} (${progress}%) - ${key}`);

        return fileSize;
      } catch (error) {
        console.error(`[Upload] Failed to upload ${key}:`, error);
        return 0;
      }
    };

    // 并发上传
    const batchSize = Math.ceil(files.length / this.threads);
    const batches: Array<Array<{ key: string; path: string }>> = [];

    for (let i = 0; i < files.length; i += batchSize) {
      batches.push(files.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      await Promise.all(batch.map(uploadFile));
    }

    console.log(`[Upload] Batch completed: ${uploaded} files uploaded, total size: ${formatSize(totalSize)}`);
    return { uploaded, totalSize };
  }
}