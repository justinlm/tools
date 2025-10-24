import COS from 'cos-nodejs-sdk-v5';
import { COSConfig } from './types';

export class COSClient {
  private client: COS;
  private config: COSConfig;
  constructor(config: COSConfig) {
    this.config = config;
    this.client = new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey,
    });
  }

  /**
   * 查询对象列表,列出目录下的所有文件
   * @param prefix Prefix表示列出的object的key以prefix开始，非必须
   * @param maxKeys 
   * @param marker 
   * @returns 
   */
  async listObjects(prefix: string = "", maxKeys: number = 1000, marker?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const params: any = {
        Bucket: this.config.bucket,
        Region: this.config.region,
        Prefix: prefix,
        MaxKeys: maxKeys,
      };

      if (marker) {
        params.Marker = marker;
      }

      this.client.getBucket(params, (err, data) => {
        console.log("查询对象列表结果:", err || data.Contents);
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  /**
   * 高级上传（推荐）
   * @param filePath 本地文件路径
   * @param key 对象键名（例如1.jpg，a/b/test.txt），必须字段
   * @param partSize 分块大小，单位MB，默认4MB, 超出4MB自动使用分块上传
   * @returns 
   */
  async uploadFile(filePath: string, key: string, partSize: number = 4): Promise<COS.UploadFileResult> {
    return new Promise((resolve, reject) => {
      this.client.uploadFile({
        Bucket: this.config.bucket,
        Region: this.config.region,
        Key: key,
        FilePath: filePath,
        SliceSize: partSize * 1024 * 1024,
        onProgress: (progressData) => {
          console.log(JSON.stringify(progressData));
        }
      }, (err, data) => {

        console.log("上传结果:", err || data);
        if (err) {
          reject(err);
        }
        else {
          resolve(data);
        }
      });
    });
  }

  /**
   * 删除对象
   * @param key 存储在桶里的对象键（例如1.jpg，a/b/test.txt），必须字段
   * @returns 
   */
  async deleteObject(key: string): Promise<COS.DeleteObjectResult> {
    return new Promise((resolve, reject) => {
      this.client.deleteObject({
        Bucket: this.config.bucket,
        Region: this.config.region,
        Key: key
      }, (err, data) => {

        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  /**
   * 获取对象内容
   * @param key 存储在桶里的对象键（例如1.jpg，a/b/test.txt），必须字段
   * @returns 
   */
  async getObject(key: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.client.getObject({
        Bucket: this.config.bucket,
        Region: this.config.region,
        Key: key
      }, (err, data) => {
        console.log("获取对象内容结果:", err || data.Body);
        if (err) reject(err);
        else resolve(data.Body as Buffer);
      });
    });
  }
}