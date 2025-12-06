export interface Config {
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
  batchSize: number;
  sourceDir: string;
  maxRetries: number;
  retryDelay: number;
}

export interface FileInfo {
  path: string;
  content: string;
  size: number;
}

export interface UploadResult {
  success: boolean;
  filePath: string;
  error?: string;
}

export interface BatchResult {
  batchNumber: number;
  totalFiles: number;
  successful: number;
  failed: number;
  results: UploadResult[];
}

export interface GitConfig {
  repoUrl: string;
  username: string;
  email: string;
  batchSize: number;
  sourceDir: string;
  commitMessagePrefix: string;
}

export interface CommitResult {
  success: boolean;
  batchNumber: number;
  filesCommitted: number;
  error?: string;
}