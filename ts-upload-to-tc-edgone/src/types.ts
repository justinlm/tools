export interface SyncConfig {
  chunkSizeMB: number;
  progressLogInterval: number;
  metaFileSuffix: string;
  cacheChunkSize: number;
}

export interface FileInfo {
  path: string;
  size: number;
  md5?: string;
  etag?: string;
  lastModified?: Date;
}

export interface RemoteObject {
  size: number;
  etag: string;
  lastModified: Date;
}

export interface SyncResult {
  scannedLocal: number;
  scannedRemote: number;
  uploaded: number;
  deleted: number;
  totalSize: number;
  elapsedTime: number;
}

export interface COSConfig {
  secretId: string;
  secretKey: string;
  region: string;
  bucket: string;
  token?: string;
}

export interface UploadProgress {
  totalBytes: number;
  uploadedBytes: number;
  currentFile?: string;
}

export interface DeltaResult {
  toUpload: Array<{ key: string; path: string }>;
  hashedBytes: number;
}

// 配置类型
export interface EnvironmentConfig {
  zoneId: string;
  cdnUrl: string;
  prefix: string;
  name: string;
  localFolder: string;
}

// 应用配置接口
export interface AppConfig {
  cosConfig: COSConfig;
  environments: Record<string, EnvironmentConfig>;
  currentEnv: string;
}