#!/usr/bin/env node
// https://cloud.tencent.com/document/product/436/8629
// https://console.tencentcloud.com/api/explorer?Product=cos&Version=2018-11-26&Action=InitiateMultipartUpload

import { InteractiveCLI } from './cli-interactive';

// 直接启动交互式工具
const cli = new InteractiveCLI();
cli.run().catch(error => {
  console.error('程序执行出错:', error);
  process.exit(1);
});