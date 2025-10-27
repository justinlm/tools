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
  async listObjects(prefix: string = "", maxKeys: number = 1000, marker?: string): Promise<COS.GetBucketResult> {
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
        // console.log("上传结果:", err || data);
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
   * 删除目录下的所有文件
   * @param prefix 目录前缀, 例如 'a/',指定拉取前缀（目录）a
   * @param maxKeys 每次查询的最大数量, 默认1000
   * @param marker 分页标记
   */
  async deleteFiles(prefix: string, maxKeys: number = 1000, marker?: string) {

    const listResult = await this.listObjects(prefix, maxKeys, marker);
    const nextMarker = listResult.NextMarker;
    const objects = listResult.Contents.map(function (item) {
      return { Key: item.Key }
    });

    this.client.deleteMultipleObject({
      Bucket: this.config.bucket,
      Region: this.config.region,
      Objects: objects,
    }, (delError, deleteResult) => {
      if (delError) {
        console.log('delete error', delError);
        console.log('delete stop');
      } else {
        console.log('delete result', deleteResult);
        if (listResult.IsTruncated === 'true')
          this.deleteFiles(prefix, maxKeys, nextMarker);
        else console.log('delete complete');
      }
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
        // console.log("获取对象内容结果:", err || data.Body);
        if (err) reject(err);
        else resolve(data.Body as Buffer);
      });
    });
  }

  /**
   * 检查对象是否存在
   * @param key 存储在桶里的对象键（例如1.jpg，a/b/test.txt），必须字段
   * @returns 
   */
  async doesObjectExist(key: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.client.headObject({
        Bucket: this.config.bucket,
        Region: this.config.region,
        Key: key,  // 存储在桶里的对象键（例如1.jpg，a/b/test.txt），必须字段
      }, (err, data) => {
        if (data) {
          resolve(true);
        } else if (err?.statusCode == 404) {
          console.log('对象不存在');
          resolve(false);
        } else if (err?.statusCode == 403) {
          console.log('没有该对象读权限');
          reject(false);
        }
      });
    })
  }
}