#!/usr/bin/env node

import { InteractiveCLI } from './cli-interactive';

// 直接启动交互式工具
const cli = new InteractiveCLI();
cli.run().catch(error => {
  console.error('程序执行出错:', error);
  process.exit(1);
});