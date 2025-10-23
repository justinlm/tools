#!/usr/bin/env node

import { createInterface } from 'readline';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { join, resolve, relative } from 'path';
import { COSSynchronizer } from './cos-synchronizer';
import { COSConfig } from './types';
import { execSync } from 'child_process';

// 配置类型
interface EnvironmentConfig {
  zoneId: string;
  cdnUrl: string;
  prefix: string;
  name: string;
}

// 环境配置
const ENVIRONMENTS: Record<string, EnvironmentConfig> = {
  'production': {
    zoneId: 'zone-3b1eze7s0k4x',
    cdnUrl: 'http://gcdn01.sandboxol.com',
    prefix: 'g5006',
    name: '正式环境'
  },
  'prerelease': {
    zoneId: 'zone-3b1eze7s0k4x',
    cdnUrl: 'http://gcdn01.sandboxol.com',
    prefix: 'g5006-prerelease',
    name: '预发布环境'
  },
  'test': {
    zoneId: 'zone-3bne9jq0r0gi',
    cdnUrl: 'http://gcdn01.sandboxol.cn',
    prefix: 'g5006-test',
    name: '测试环境'
  }
};

// COS配置
const cosConfig: COSConfig = {
  secretId: 'IKIDMispiXEsBUggT7Z5RaWFn9yQgV8ZmmZE',
  secretKey: 'd2EC0bz96yTmslRtFPNCpFSSEnBUbUGr',
  region: 'ap-singapore',
  bucket: 'h5-res-1323539502'
};

class InteractiveCLI {
  private rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  private currentDir: string;
  private selectedEnvironment: EnvironmentConfig | null = null;
  private selectedFolder: string = '';
  private versionName: string = '';

  constructor() {
    this.currentDir = process.cwd();
  }

  // 提问工具函数
  private question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  // 显示文件夹列表并选择
  private async selectFolder(): Promise<string> {
    console.log('\n📁 选择本地文件夹:');
    
    const items = readdirSync(this.currentDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    if (items.length === 0) {
      console.log('❌ 当前目录下没有文件夹');
      process.exit(1);
    }

    // 显示文件夹列表
    items.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item}`);
    });

    while (true) {
      const answer = await this.question('\n请选择文件夹 (输入数字): ');
      const num = parseInt(answer);
      
      if (!isNaN(num) && num >= 1 && num <= items.length) {
        return items[num - 1];
      }
      
      console.log('❌ 无效的选择，请重新输入');
    }
  }

  // 选择环境
  private async selectEnvironment(): Promise<EnvironmentConfig> {
    console.log('\n🌍 选择部署环境:');
    
    Object.entries(ENVIRONMENTS).forEach(([key, config], index) => {
      console.log(`  ${index + 1}. ${config.name} (${key})`);
    });

    while (true) {
      const answer = await this.question('\n请选择环境 (输入数字): ');
      const num = parseInt(answer);
      const envKeys = Object.keys(ENVIRONMENTS);
      
      if (!isNaN(num) && num >= 1 && num <= envKeys.length) {
        return ENVIRONMENTS[envKeys[num - 1]];
      }
      
      console.log('❌ 无效的选择，请重新输入');
    }
  }

  // 输入版本名称
  private async inputVersionName(): Promise<string> {
    console.log('\n🏷️  设置版本名称:');
    console.log('  提示: 可以为空（直接使用文件夹名），或输入自定义版本名称');
    
    const answer = await this.question('请输入版本名称（直接回车使用文件夹名）: ');
    return answer.trim();
  }

  // 显示本地配置信息
  private showLocalConfig() {
    console.log('\n📋 本地配置信息:');
    
    try {
      // 检查是否存在配置文件
      console.log('  🔍 检查项目结构...this.currentDir:'+ this.currentDir);
      const assetsDir = join(this.currentDir, '..', 'Assets', 'Res');
      
      // CDN配置
      const addressFile = join(assetsDir, 'Boot', 'Address.bson');
      if (existsSync(addressFile)) {
        console.log('  📡 CDN配置:');
        const content = readFileSync(addressFile, 'utf-8');
        const cdnLines = content.split('\n').filter(line => line.includes('cdnUrl'));
        cdnLines.forEach(line => console.log(`    ${line.trim()}`));
      }

      // 区服配置
      const regionFile = join(assetsDir, 'Config', 'Region.bson');
      if (existsSync(regionFile)) {
        console.log('  🎮 区服配置:');
        const content = readFileSync(regionFile, 'utf-8');
        const idNameLines = content.split('\n').filter(line => line.includes('id') && line.includes('name'));
        const recommendLines = content.split('\n').filter(line => line.includes('recommendRegionId'));
        
        idNameLines.slice(0, 3).forEach(line => console.log(`    ${line.trim()}`));
        recommendLines.slice(0, 2).forEach(line => console.log(`    ${line.trim()}`));
      }
    } catch (error) {
      console.log('  ⚠️  无法读取本地配置文件');
    }
  }

  // 列出远程已有版本
  private async listRemoteVersions(prefix: string) {
    console.log('\n📊 远程已有版本:');
    // 这里可以实现列出远程版本的功能
    console.log('  🔄 正在获取远程版本列表...');
    // 暂时显示占位信息
    console.log('  📝 版本列表功能待实现');
  }

  // 确认操作
  private async confirmOperation(operationInfo: {
    environment: string;
    folder: string;
    version: string;
    remotePath: string;
  }): Promise<boolean> {
    console.log('\n✅ 操作确认:');
    console.log(`  环境: ${operationInfo.environment}`);
    console.log(`  文件夹: ${operationInfo.folder}`);
    console.log(`  版本: ${operationInfo.version || '使用文件夹名'}`);
    console.log(`  远端路径: ${operationInfo.remotePath}`);
    
    const answer = await this.question('\n确认开始上传？(y/n): ');
    return answer.toLowerCase() === 'y';
  }

  // 清理冗余文件确认
  private async confirmCleanup(): Promise<boolean> {
    const answer = await this.question('\n🧹 是否需要清理远端冗余文件？(y/n): ');
    return answer.toLowerCase() === 'y';
  }

  // 执行同步操作
  private async performSync(remotePrefix: string, localPath: string, md5CachePath: string) {
    console.log('\n🚀 开始同步操作...');
    
    const synchronizer = new COSSynchronizer(cosConfig, 8, 4);
    
    try {
      const result = await synchronizer.sync(localPath, remotePrefix, false, md5CachePath);
      
      console.log('\n📈 同步结果:');
      console.log(`  扫描本地文件: ${result.scannedLocal}`);
      console.log(`  扫描远程对象: ${result.scannedRemote}`);
      console.log(`  上传文件数: ${result.uploaded}`);
      console.log(`  删除对象数: ${result.deleted}`);
      console.log(`  总上传大小: ${this.formatSize(result.totalSize)}`);
      console.log(`  耗时: ${result.elapsedTime.toFixed(2)}秒`);
      
      return result;
    } catch (error) {
      console.error('❌ 同步失败:', error);
      throw error;
    }
  }

  // 刷新CDN缓存
  private async flushCDNCache(target: string, zoneId: string) {
    console.log('\n🔄 刷新CDN缓存...');
    console.log(`  目标: ${target}`);
    console.log(`  区域ID: ${zoneId}`);
    
    // 这里可以实现CDN缓存刷新功能
    console.log('  ✅ 缓存刷新功能待实现');
  }

  // 清理冗余文件
  private async cleanupRedundantFiles(remotePrefix: string) {
    console.log('\n🧹 清理冗余文件...');
    
    const synchronizer = new COSSynchronizer(cosConfig, 8, 4);
    
    try {
      const result = await synchronizer.sync(undefined, remotePrefix, true);
      console.log(`  删除冗余文件数: ${result.deleted}`);
    } catch (error) {
      console.error('❌ 清理失败:', error);
    }
  }

  // 格式化文件大小
  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let idx = 0;
    let num = bytes;
    while (num >= 1024 && idx < units.length - 1) {
      num /= 1024;
      idx++;
    }
    return `${num.toFixed(2)} ${units[idx]}`;
  }

  // 主流程
  async run() {
    console.log('🚀 TypeScript COS上传工具');
    console.log('='.repeat(50));

    try {
      // 1. 选择环境
      this.selectedEnvironment = await this.selectEnvironment();
      
      // 2. 选择文件夹
      this.selectedFolder = await this.selectFolder();
      
    //   // 3. 显示本地配置
    //   this.showLocalConfig();
      
    //   // 4. 列出远程版本
    //   await this.listRemoteVersions(this.selectedEnvironment.prefix);
      
    //   // 5. 输入版本名称
    //   this.versionName = await this.inputVersionName();
      
    //   // 6. 构建远程路径
    //   const remoteRootDir = this.versionName 
    //     ? `${this.versionName}/${this.selectedFolder}`
    //     : this.selectedFolder;
    //   const remotePrefix = `${this.selectedEnvironment.prefix}/${remoteRootDir}`;
    //   const localPath = join(this.currentDir, this.selectedFolder);
    //   const md5CachePath = join(this.currentDir, `${this.selectedFolder}.md5cache.json`);
      
    //   // 7. 确认操作
    //   const confirmed = await this.confirmOperation({
    //     environment: this.selectedEnvironment.name,
    //     folder: this.selectedFolder,
    //     version: this.versionName,
    //     remotePath: remotePrefix
    //   });
      
    //   if (!confirmed) {
    //     console.log('❌ 操作已取消');
    //     this.rl.close();
    //     return;
    //   }
      
    //   // 8. 执行同步
    //   await this.performSync(remotePrefix, localPath, md5CachePath);
      
    //   // 9. 刷新CDN缓存
    //   const targetUrl = `${this.selectedEnvironment.cdnUrl}/${remotePrefix}/`;
    //   await this.flushCDNCache(targetUrl, this.selectedEnvironment.zoneId);
      
    //   // 10. 确认是否清理冗余文件
    //   const needCleanup = await this.confirmCleanup();
    //   if (needCleanup) {
    //     console.log('\n⏰ 清理操作将在30秒后执行...');
    //     await this.delay(30000);
    //     await this.cleanupRedundantFiles(remotePrefix);
    //   }
      
    //   console.log('\n🎉 操作完成！');
      
    // } catch (error) {
    //   console.error('💥 程序执行出错:', error);
    // } finally {
    //   this.rl.close();
    // }
  }

  // 延迟函数
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 启动程序
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = new InteractiveCLI();
  cli.run().catch(console.error);
}

export { InteractiveCLI };