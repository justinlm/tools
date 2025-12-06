#!/usr/bin/env node

import { GitBatchCommitter, GitConfig } from './GitBatchCommitter';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const config: GitConfig = {
    repoUrl: process.env.GITHUB_REPO_URL!,
    username: process.env.GIT_USERNAME!,
    email: process.env.GIT_EMAIL!,
    batchSize: parseInt(process.env.BATCH_SIZE || '1000'),
    sourceDir: process.env.SOURCE_DIR || './files_to_upload',
    commitMessagePrefix: process.env.COMMIT_MESSAGE_PREFIX || 'Add files batch'
  };

  // 验证配置
  if (!config.repoUrl || !config.username || !config.email) {
    console.error('Error: Please set GITHUB_REPO_URL, GIT_USERNAME and GIT_EMAIL environment variables');
    console.log('Edit .env file and fill in the values');
    process.exit(1);
  }

  const committer = new GitBatchCommitter(config);
  
  try {
    console.log('Starting batch Git commit process...');
    await committer.commitAllFiles();
    console.log('Batch commit process completed successfully!');
  } catch (error) {
    console.error('Error during commit process:', error);
    process.exit(1);
  }
}

main().catch(console.error);