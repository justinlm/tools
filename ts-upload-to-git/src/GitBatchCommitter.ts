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
  private ignorePatterns: string[] = [];

  constructor(config: GitConfig) {
    this.config = config;
    this.gitDir = path.resolve(config.sourceDir);
  }

  /**
   * 解析.gitignore文件
   */
  private async parseGitignore(): Promise<void> {
    const gitignorePath = path.join(this.gitDir, '.gitignore');
    
    if (!await fs.pathExists(gitignorePath)) {
      console.log(chalk.yellow('No .gitignore file found, skipping ignore patterns'));
      return;
    }

    try {
      const content = await fs.readFile(gitignorePath, 'utf-8');
      const patterns = content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#')) // 过滤空行和注释
        .filter(pattern => pattern.length > 0);

      this.ignorePatterns = patterns;
      console.log(chalk.cyan(`Loaded ${patterns.length} ignore patterns from .gitignore`));
      
      if (patterns.length > 0) {
        console.log(chalk.gray('Ignore patterns:'));
        patterns.forEach(pattern => console.log(chalk.gray(`  - ${pattern}`)));
      }
    } catch (error) {
      console.log(chalk.yellow('Failed to parse .gitignore file, skipping ignore patterns'));
    }
  }

  /**
   * 检查文件是否应该被忽略
   */
  private shouldIgnoreFile(filePath: string): boolean {
    if (this.ignorePatterns.length === 0) {
      return false;
    }

    const relativePath = path.relative(this.gitDir, filePath).replace(/\\/g, '/');
    
    for (const pattern of this.ignorePatterns) {
      if (this.matchesPattern(relativePath, pattern)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 检查文件路径是否匹配忽略模式
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // 处理目录模式（以/结尾）
    if (pattern.endsWith('/')) {
      const dirPattern = pattern.slice(0, -1);
      return filePath.startsWith(dirPattern) || 
             filePath.includes('/' + dirPattern + '/') ||
             filePath.endsWith('/' + dirPattern);
    }
    
    // 处理通配符模式
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(filePath);
    }
    
    // 精确匹配
    return filePath === pattern || 
           filePath.endsWith('/' + pattern) ||
           filePath.includes('/' + pattern + '/');
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
   * 检查文件是否已经被Git跟踪（已提交或已暂存）
   */
  private async isFileTrackedByGit(filePath: string): Promise<boolean> {
    try {
      // 获取相对于Git仓库根目录的相对路径
      const relativePath = path.relative(this.gitDir, filePath).replace(/\\/g, '/');
      
      // 使用git status命令检查文件状态
      const statusResult = await this.runGitCommand(`git status --porcelain "${relativePath}"`);
      
      if (!statusResult.success) {
        // 如果命令执行失败，假设文件未被跟踪
        return false;
      }
      
      // git status --porcelain 输出格式说明：
      // - 空输出：文件未被修改（已提交）
      // - 有输出：文件有变更（已暂存或未暂存）
      // 我们只关心文件是否在Git索引中，所以检查是否有输出
      return statusResult.output.trim().length > 0;
    } catch (error) {
      console.log(chalk.yellow(`Warning: Failed to check Git status for file ${filePath}`));
      return false;
    }
  }

  /**
   * 获取所有要提交的文件（过滤.gitignore中的内容和已提交到Git的文件）
   */
  async getAllFiles(): Promise<string[]> {
    const files: string[] = [];
    let totalScanned = 0;
    let totalFiles = 0;
    let totalDirs = 0;
    let skippedFiles = 0;
    let trackedFiles = 0;

    // 先解析.gitignore文件
    await this.parseGitignore();

    // 先统计总文件数（用于进度显示）
    console.log(chalk.cyan('Counting total files and directories...'));
    async function countTotalItems(dir: string, committer: GitBatchCommitter): Promise<number> {
      let count = 0;
      try {
        const items = await fs.readdir(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = await fs.stat(fullPath);
          count++;
          
          if (stat.isDirectory() && item !== '.git' && !committer.shouldIgnoreFile(fullPath)) {
            count += await countTotalItems(fullPath, committer);
          }
        }
      } catch (error) {
        console.log(chalk.yellow(`Warning: Failed to count items in ${dir}`));
      }
      return count;
    }

    const totalItems = await countTotalItems(this.config.sourceDir, this);
    console.log(chalk.cyan(`Total items to scan: ${totalItems}`));

    // 显示进度条的函数
    function showProgress(current: number, total: number, action: string = 'Scanning') {
      const percentage = Math.round((current / total) * 100);
      const barLength = 30;
      const filledLength = Math.round((barLength * current) / total);
      const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
      
      process.stdout.write(`\r${action}: [${bar}] ${percentage}% (${current}/${total})`);
      
      if (current === total) {
        process.stdout.write('\n');
      }
    }

    async function walkDirectory(dir: string, committer: GitBatchCommitter) {
      const items = await fs.readdir(dir);
      
      for (const item of items) {
        totalScanned++;
        const fullPath = path.join(dir, item);
        const stat = await fs.stat(fullPath);
        
        // 更新进度显示（每扫描10个文件更新一次进度条）
        if (totalScanned % 10 === 0 || totalScanned === totalItems) {
          showProgress(totalScanned, totalItems, 'Scanning files');
        }
        
        if (stat.isDirectory()) {
          totalDirs++;
          // 跳过.git目录和.gitignore中指定的目录
          if (item !== '.git' && !committer.shouldIgnoreFile(fullPath)) {
            await walkDirectory(fullPath, committer);
          } else {
            console.log(chalk.gray(`\nSkipping directory: ${fullPath}`));
          }
        } else {
          totalFiles++;
          // 跳过.gitignore中指定的文件和已经被Git跟踪的文件
          if (!committer.shouldIgnoreFile(fullPath)) {
            // 检查文件是否已经被Git跟踪
            const isTracked = await committer.isFileTrackedByGit(fullPath);
            if (!isTracked) {
              files.push(fullPath);
              // 显示新发现的文件（每发现10个文件显示一次）
              if (files.length % 10 === 0) {
                console.log(chalk.green(`\n✓ Found ${files.length} new files so far...`));
              }
            } else {
              trackedFiles++;
              // 显示跳过的跟踪文件（每跳过50个文件显示一次）
              if (trackedFiles % 50 === 0) {
                console.log(chalk.yellow(`\n⚠ Skipped ${trackedFiles} tracked files so far...`));
              }
            }
          } else {
            skippedFiles++;
            // 显示跳过的忽略文件（每跳过50个文件显示一次）
            if (skippedFiles % 50 === 0) {
              console.log(chalk.blue(`\nℹ Skipped ${skippedFiles} ignored files so far...`));
            }
          }
        }
      }
    }

    if (!await fs.pathExists(this.config.sourceDir)) {
      throw new Error(`Source directory does not exist: ${this.config.sourceDir}`);
    }

    console.log(chalk.cyan('\nStarting file scan with real-time progress...'));
    console.log(chalk.gray('Press Ctrl+C to stop the scan at any time\n'));

    await walkDirectory(this.config.sourceDir, this);
    
    // 显示最终统计信息
    console.log(chalk.cyan('\n=== Scan Complete ==='));
    console.log(chalk.green(`✓ Total scanned: ${totalItems} items`));
    console.log(chalk.green(`✓ Directories: ${totalDirs}`));
    console.log(chalk.green(`✓ Files: ${totalFiles}`));
    console.log(chalk.yellow(`⚠ Skipped (ignored): ${skippedFiles} files`));
    console.log(chalk.yellow(`⚠ Skipped (tracked): ${trackedFiles} files`));
    console.log(chalk.cyan(`✓ New files to commit: ${files.length}`));
    
    // 显示过滤统计信息
    if (files.length > 0) {
      console.log(chalk.gray('\nFiles to be committed:'));
      // 只显示前20个文件，避免输出过多
      const displayFiles = files.slice(0, 20);
      displayFiles.forEach(file => {
        const relativePath = path.relative(this.config.sourceDir, file);
        console.log(chalk.gray(`  - ${relativePath}`));
      });
      if (files.length > 20) {
        console.log(chalk.gray(`  ... and ${files.length - 20} more files`));
      }
    } else {
      console.log(chalk.yellow('No new files found to commit'));
    }
    
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
        // console.log(chalk.green(`✓ Added file ${file}`));
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

    // 3. 获取所有文件（自动应用.gitignore过滤）
    console.log(chalk.cyan('Scanning files (applying .gitignore filters)...'));
    const allFiles = await this.getAllFiles();
    
    // 将文件列表保存到文本文件中
    await this.saveFileListToText(allFiles);
    
    if (allFiles.length === 0) {
      console.log(chalk.yellow('No files found to commit after .gitignore filtering'));
      return;
    }

    console.log(chalk.cyan(`Found ${allFiles.length} files after .gitignore filtering`));

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

        // 每次成功提交后立即推送到远程仓库
        console.log(chalk.cyan(`Pushing batch ${i + 1} to remote repository...`));
        const pushResult = await this.pushToRemote();
        
        if (!pushResult) {
          console.log(chalk.red(`✗ Failed to push batch ${i + 1} to remote repository`));
        } else {
          console.log(chalk.green(`✓ Batch ${i + 1} successfully pushed to remote repository`));
        }
      }

      // 批次间延迟
      if (i < batches.length - 1) {
        console.log(chalk.gray('Waiting for next batch...'));
        await this.delay(1000);
      }
    }

    console.log(chalk.cyan('\n=== Commit Summary ==='));
    console.log(chalk.green(`Successful batches: ${successfulBatches}/${batches.length}`));
    console.log(chalk.green(`Total files committed: ${totalCommitted}`));
    console.log(chalk.cyan(`Total files found (after .gitignore): ${allFiles.length}`));
  }

  /**
   * 将文件列表保存到文本文件中
   */
  private async saveFileListToText(files: string[]): Promise<void> {
    try {
      // 创建文件列表保存路径
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputFile = path.join(this.config.sourceDir, `file-list-${timestamp}.txt`);
      
      // 生成文件内容
      const content = [
        `# File List Generated by GitBatchCommitter`,
        `# Generated at: ${new Date().toISOString()}`,
        `# Total files: ${files.length}`,
        `# Source directory: ${this.config.sourceDir}`,
        ``,
        ...files.map(file => {
          const relativePath = path.relative(this.config.sourceDir, file);
          return relativePath;
        })
      ].join('\n');
      
      // 写入文件
      await fs.writeFile(outputFile, content, 'utf-8');
      
      console.log(chalk.green(`✓ File list saved to: ${outputFile}`));
      console.log(chalk.gray(`  Total files recorded: ${files.length}`));
      
    } catch (error) {
      console.log(chalk.yellow(`⚠ Failed to save file list: ${error}`));
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}