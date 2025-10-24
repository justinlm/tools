#!/usr/bin/env node

import { Command } from 'commander';
import { InteractiveCLI } from './cli-interactive';
import { COSSynchronizer } from './cos-synchronizer';
import { COSConfig } from './types';
import { formatSize } from './utils';

const program = new Command();

// COS配置
const cosConfig: COSConfig = {
  secretId: 'IKIDh9H6bmY19hvoMaU3HDo52ebEWU8RP3MZ',
  secretKey: 'vWmhJbZFcfOousXsuczqNZRyA1YniJaX',
  region: 'eu-frankfurt',
  bucket: 'djghoul-1352581662'
};

program
  .name('ts-cos-sync')
  .description('TypeScript implementation of Tencent COS sync tool')
  .version('1.0.0');

// 交互模式（默认）
program
  .command('interactive')
  .description('启动交互式上传工具（默认命令）')
  .action(async () => {
    const cli = new InteractiveCLI();
    await cli.run();
  });

// 命令行模式
program
  .command('sync')
  .description('命令行模式同步')
  .requiredOption('--prefix <prefix>', 'COS prefix for sync operation')
  .option('--local <dir>', 'Local directory path')
  .option('--delete', 'Delete remote objects not present locally')
  .option('--threads <number>', 'Number of threads', '8')
  .option('--hash-chunk <mb>', 'Hash chunk size in MB', '4')
  .option('--md5-cache <path>', 'MD5 cache file path')
  .action(async (options) => {
    try {
      const synchronizer = new COSSynchronizer(
        cosConfig,
        parseInt(options.threads),
        parseInt(options.hashChunk)
      );

      const result = await synchronizer.sync(
        options.local,
        options.prefix,
        options.delete,
      );

      console.log('\nSync completed:');
      console.log(`Scanned local files: ${result.scannedLocal}`);
      console.log(`Scanned remote objects: ${result.scannedRemote}`);
      console.log(`Uploaded files: ${result.uploaded}`);
      console.log(`Deleted objects: ${result.deleted}`);
      console.log(`Total upload size: ${formatSize(result.totalSize)}`);
      console.log(`Elapsed time: ${result.elapsedTime.toFixed(2)}s`);

    } catch (error) {
      console.error('Sync failed:', error);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List folders in COS')
  .requiredOption('--prefix <prefix>', 'COS prefix to list')
  .action(async (options) => {
    console.log('List functionality would be implemented here');
  });

program
  .command('flush')
  .description('Flush CDN cache')
  .requiredOption('--zone-id <id>', 'EdgeOne ZoneId')
  .requiredOption('--target <url>', 'Flush target URL')
  .action(async (options) => {
    console.log('Flush functionality would be implemented here');
  });

// 如果没有提供命令，默认使用交互模式
if (process.argv.length === 2) {
  const cli = new InteractiveCLI();
  cli.run().catch(console.error);
} else {
  program.parse();
}