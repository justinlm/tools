#!/usr/bin/env node

import { Command } from 'commander';
import { InteractiveCLI } from './cli-interactive';
import { PurgeTEO } from './purge-teo';

const program = new Command();

// 配置命令行参数
program
  .name('ts-cos-upload-tool')
  .description('腾讯云 COS 文件上传和 TEO 缓存刷新工具')
  .version('1.0.0');

// 添加 upload 命令
program
  .command('upload')
  .description('启动交互式文件上传界面')
  .action(() => {
    console.log('启动交互式文件上传工具...');
    const cli = new InteractiveCLI();
    cli.run().catch(console.error);
  });

// 添加 purge 命令
program
  .command('purge')
  .description('执行 TEO 缓存刷新任务')
  .action(async () => {
    try {
      console.log('执行 TEO 缓存刷新任务工具...');
      const purgeTEO = new PurgeTEO();
      await purgeTEO.purgeTask();
      console.log('TEO 缓存刷新任务完成');
    } catch (error) {
      console.error('TEO 缓存刷新任务失败:', error);
      process.exit(1);
    }
  });

// 如果没有提供命令，显示帮助信息
if (process.argv.length === 2) {
  program.help();
} else {
  program.parse();
}