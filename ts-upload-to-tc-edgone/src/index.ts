#!/usr/bin/env node

import { Command } from 'commander';
import { InteractiveCLI } from './cli-interactive';

const program = new Command();

console.log("Hello, World!");

// 如果没有提供命令，默认使用交互模式
if (process.argv.length === 2) {
  const cli = new InteractiveCLI();
  cli.run().catch(console.error);
} else {
  program.parse();
}