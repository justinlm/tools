import axios, { AxiosInstance } from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { Config, FileInfo, UploadResult, BatchResult } from './types';
import chalk from 'chalk';

export class GithubBatchUploader {
  private config: Config;
  private client: AxiosInstance;

  constructor(config: Config) {
    this.config = config;
    this.client = axios.create({
      baseURL: `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}`,
      headers: {
        'Authorization': `Bearer ${config.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'GitHub-Batch-Uploader'
      }
    });
  }

  /**
   * Get all files in directory
   */
  async getAllFiles(): Promise<string[]> {
    const files: string[] = [];

    async function walkDirectory(dir: string) {
      const items = await fs.readdir(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = await fs.stat(fullPath);
        
        if (stat.isDirectory()) {
          await walkDirectory(fullPath);
        } else {
          files.push(fullPath);
        }
      }
    }

    if (!await fs.pathExists(this.config.sourceDir)) {
      throw new Error(`Source directory does not exist: ${this.config.sourceDir}`);
    }

    await walkDirectory(this.config.sourceDir);
    return files;
  }

  /**
   * Read file content
   */
  async readFileContent(filePath: string): Promise<FileInfo> {
    const content = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative(this.config.sourceDir, filePath);
    
    return {
      path: relativePath.replace(/\\/g, '/'), // Use forward slashes
      content: content,
      size: content.length
    };
  }

  /**
   * Upload single file to GitHub
   */
  async uploadFile(fileInfo: FileInfo, retryCount = 0): Promise<UploadResult> {
    try {
      // GitHub API create or update file
      const response = await this.client.put(`/contents/${fileInfo.path}`, {
        message: `Add file: ${fileInfo.path}`,
        content: Buffer.from(fileInfo.content).toString('base64'),
        branch: 'main'
      });

      return {
        success: true,
        filePath: fileInfo.path
      };
    } catch (error: any) {
      if (retryCount < this.config.maxRetries) {
        console.log(chalk.yellow(`Retry upload ${fileInfo.path} (${retryCount + 1}/${this.config.maxRetries})`));
        await this.delay(this.config.retryDelay);
        return this.uploadFile(fileInfo, retryCount + 1);
      }

      return {
        success: false,
        filePath: fileInfo.path,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Upload a batch of files
   */
  async uploadBatch(files: FileInfo[], batchNumber: number): Promise<BatchResult> {
    console.log(chalk.blue(`\n=== Upload Batch ${batchNumber} (${files.length} files) ===`));
    
    const results: UploadResult[] = [];
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const fileInfo = files[i];
      console.log(chalk.gray(`[${i + 1}/${files.length}] Uploading: ${fileInfo.path}`));
      
      const result = await this.uploadFile(fileInfo);
      results.push(result);

      if (result.success) {
        successful++;
        console.log(chalk.green(`✓ Success: ${fileInfo.path}`));
      } else {
        failed++;
        console.log(chalk.red(`✗ Failed: ${fileInfo.path} - ${result.error}`));
      }

      // Add small delay to avoid API limits
      await this.delay(100);
    }

    return {
      batchNumber,
      totalFiles: files.length,
      successful,
      failed,
      results
    };
  }

  /**
   * Upload all files
   */
  async uploadAllFiles(): Promise<void> {
    console.log(chalk.cyan('Scanning files...'));
    const allFiles = await this.getAllFiles();
    
    if (allFiles.length === 0) {
      console.log(chalk.yellow('No files found'));
      return;
    }

    console.log(chalk.cyan(`Found ${allFiles.length} files`));
    
    // Batch processing
    const batches: FileInfo[][] = [];
    for (let i = 0; i < allFiles.length; i += this.config.batchSize) {
      const batchFiles = allFiles.slice(i, i + this.config.batchSize);
      const fileInfos = await Promise.all(
        batchFiles.map(file => this.readFileContent(file))
      );
      batches.push(fileInfos);
    }

    console.log(chalk.cyan(`Split into ${batches.length} batches, ${this.config.batchSize} files per batch`));

    let totalSuccessful = 0;
    let totalFailed = 0;

    for (let i = 0; i < batches.length; i++) {
      const batchResult = await this.uploadBatch(batches[i], i + 1);
      
      totalSuccessful += batchResult.successful;
      totalFailed += batchResult.failed;

      console.log(chalk.blue(`Batch ${i + 1} completed: ${batchResult.successful} successful, ${batchResult.failed} failed`));
      
      // Delay between batches
      if (i < batches.length - 1) {
        console.log(chalk.gray('Waiting for next batch...'));
        await this.delay(2000);
      }
    }

    console.log(chalk.cyan('\n=== Upload Summary ==='));
    console.log(chalk.green(`Successful: ${totalSuccessful} files`));
    if (totalFailed > 0) {
      console.log(chalk.red(`Failed: ${totalFailed} files`));
    }
    console.log(chalk.cyan(`Total: ${allFiles.length} files`));
  }

  /**
   * Delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}