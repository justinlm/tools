import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

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

export class GitBatchCommitter {
  private config: GitConfig;
  private gitDir: string;

  constructor(config: GitConfig) {
    this.config = config;
    this.gitDir = path.resolve(config.sourceDir);
  }

  /**
   * 执行Git命令
   */
  private async runGitCommand(command: string, cwd?: string): Promise<{ success: boolean; output: string; error?: string }> {
    try {
      const { stdout, stderr } = await execAsync(command, { 
        cwd: cwd || this.gitDir,
        encoding: 'utf8'
      });
      
      return {
        success: true,
        output: stdout,
        error: stderr
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }

  /**
   * 初始化Git仓库
   */
  async initializeGitRepo(): Promise<boolean> {
    console.log(chalk.cyan('Initializing Git repository...'));

    // 检查是否已经是Git仓库
    const gitCheck = await this.runGitCommand('git status');
    if (gitCheck.success) {
      console.log(chalk.green('✓ Git repository already exists'));
      return true;
    }

    // 初始化新的Git仓库
    const initResult = await this.runGitCommand('git init');
    if (!initResult.success) {
      console.log(chalk.red('✗ Failed to initialize Git repository'));
      return false;
    }

    // 配置用户信息
    await this.runGitCommand(`git config user.name "${this.config.username}"`);
    await this.runGitCommand(`git config user.email "${this.config.email}"`);

    console.log(chalk.green('✓ Git repository initialized successfully'));
    return true;
  }

  /**
   * 设置远程仓库
   */
  async setupRemoteRepo(): Promise<boolean> {
    console.log(chalk.cyan('Setting up remote repository...'));

    // 检查是否已设置远程仓库
    const remoteCheck = await this.runGitCommand('git remote -v');
    if (remoteCheck.success && remoteCheck.output.includes('origin')) {
      console.log(chalk.green('✓ Remote repository already configured'));
      return true;
    }

    // 添加远程仓库
    const remoteResult = await this.runGitCommand(`git remote add origin ${this.config.repoUrl}`);
    if (!remoteResult.success) {
      console.log(chalk.red('✗ Failed to add remote repository'));
      return false;
    }

    console.log(chalk.green('✓ Remote repository configured successfully'));
    return true;
  }

  /**
   * 获取所有要提交的文件
   */
  async getAllFiles(): Promise<string[]> {
    const files: string[] = [];

    async function walkDirectory(dir: string) {
      const items = await fs.readdir(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = await fs.stat(fullPath);
        
        if (stat.isDirectory()) {
          // 跳过.git目录
          if (item !== '.git') {
            await walkDirectory(fullPath);
          }
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
   * 提交一批文件
   */
  async commitBatch(files: string[], batchNumber: number): Promise<CommitResult> {
    console.log(chalk.blue(`\n=== Committing Batch ${batchNumber} (${files.length} files) ===`));

    try {
      // 添加文件到暂存区
      for (const file of files) {
        const addResult = await this.runGitCommand(`git add "${file}"`);
        if (!addResult.success) {
          console.log(chalk.yellow(`Warning: Failed to add file ${file}`));
        }
      }

      // 提交更改
      const commitMessage = `${this.config.commitMessagePrefix} ${batchNumber}`;
      const commitResult = await this.runGitCommand(`git commit -m "${commitMessage}"`);
      
      if (!commitResult.success) {
        // 如果没有更改需要提交，跳过
        if (commitResult.error?.includes('nothing to commit')) {
          console.log(chalk.yellow('No changes to commit in this batch'));
          return {
            success: true,
            batchNumber,
            filesCommitted: 0
          };
        }
        throw new Error(`Commit failed: ${commitResult.error}`);
      }

      console.log(chalk.green(`✓ Batch ${batchNumber} committed successfully: ${files.length} files`));
      
      return {
        success: true,
        batchNumber,
        filesCommitted: files.length
      };

    } catch (error: any) {
      console.log(chalk.red(`✗ Batch ${batchNumber} commit failed: ${error.message}`));
      return {
        success: false,
        batchNumber,
        filesCommitted: 0,
        error: error.message
      };
    }
  }

  /**
   * 推送到远程仓库
   */
  async pushToRemote(): Promise<boolean> {
    console.log(chalk.cyan('\nPushing to remote repository...'));

    // 首次推送需要设置上游分支
    const pushResult = await this.runGitCommand('git push -u origin main');
    if (!pushResult.success) {
      // 如果main分支不存在，尝试master分支
      const pushResultMaster = await this.runGitCommand('git push -u origin master');
      if (!pushResultMaster.success) {
        console.log(chalk.red('✗ Failed to push to remote repository'));
        return false;
      }
    }

    console.log(chalk.green('✓ Successfully pushed to remote repository'));
    return true;
  }

  /**
   * 执行批量提交
   */
  async commitAllFiles(): Promise<void> {
    console.log(chalk.cyan('Starting batch Git commit process...'));

    // 1. 初始化Git仓库
    if (!await this.initializeGitRepo()) {
      throw new Error('Failed to initialize Git repository');
    }

    // 2. 设置远程仓库
    if (!await this.setupRemoteRepo()) {
      throw new Error('Failed to setup remote repository');
    }

    // 3. 获取所有文件
    console.log(chalk.cyan('Scanning files...'));
    const allFiles = await this.getAllFiles();
    
    if (allFiles.length === 0) {
      console.log(chalk.yellow('No files found to commit'));
      return;
    }

    console.log(chalk.cyan(`Found ${allFiles.length} files`));

    // 4. 分批提交
    const batches: string[][] = [];
    for (let i = 0; i < allFiles.length; i += this.config.batchSize) {
      batches.push(allFiles.slice(i, i + this.config.batchSize));
    }

    console.log(chalk.cyan(`Split into ${batches.length} batches, ${this.config.batchSize} files per batch`));

    let totalCommitted = 0;
    let successfulBatches = 0;

    for (let i = 0; i < batches.length; i++) {
      const result = await this.commitBatch(batches[i], i + 1);
      
      if (result.success) {
        totalCommitted += result.filesCommitted;
        successfulBatches++;
      }

      // 批次间延迟
      if (i < batches.length - 1) {
        console.log(chalk.gray('Waiting for next batch...'));
        await this.delay(1000);
      }
    }

    // 5. 推送到远程仓库
    if (successfulBatches > 0) {
      await this.pushToRemote();
    }

    console.log(chalk.cyan('\n=== Commit Summary ==='));
    console.log(chalk.green(`Successful batches: ${successfulBatches}/${batches.length}`));
    console.log(chalk.green(`Total files committed: ${totalCommitted}`));
    console.log(chalk.cyan(`Total files found: ${allFiles.length}`));
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}