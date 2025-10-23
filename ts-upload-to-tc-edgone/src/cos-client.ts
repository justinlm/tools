import COS from 'cos-nodejs-sdk-v5';
import { COSConfig } from './types.js';

export class COSClient {
  private client: COS;
  
  constructor(config: COSConfig) {
    this.client = new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey,
      Region: config.region
    });
  }
  
  async listObjects(prefix: string, maxKeys: number = 1000, marker?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const params: any = {
        Bucket: 'h5-res-1323539502',
        Prefix: prefix,
        MaxKeys: maxKeys
      };
      
      if (marker) {
        params.Marker = marker;
      }
      
      this.client.getBucket(params, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }
  
  async uploadFile(localPath: string, key: string, partSize: number = 4): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.uploadFile({
        Bucket: 'h5-res-1323539502',
        Region: 'ap-singapore',
        Key: key,
        LocalFile: localPath,
        PartSize: partSize * 1024 * 1024,
        onProgress: (progressData) => {
          // Progress callback
        }
      }, (err, data) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  
  async deleteObject(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.deleteObject({
        Bucket: 'h5-res-1323539502',
        Key: key
      }, (err, data) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  
  async getObject(key: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.client.getObject({
        Bucket: 'h5-res-1323539502',
        Key: key
      }, (err, data) => {
        if (err) reject(err);
        else resolve(data.Body as Buffer);
      });
    });
  }
}