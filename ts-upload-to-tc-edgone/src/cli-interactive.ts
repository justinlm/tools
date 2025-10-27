#!/usr/bin/env node

import { createInterface } from 'readline';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { join, resolve, relative } from 'path';
import { COSSynchronizer } from './cos-synchronizer';
import { AppConfig, COSConfig, EnvironmentConfig } from './types';
import { execSync } from 'child_process';
import { loadAppConfig } from './utils';

class InteractiveCLI {
    private rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    private currentDir: string;
    private selectedEnvironment: EnvironmentConfig | null = null;
    private selectedFolder: string = '';
    private versionName: string = '';
    private appConfig: AppConfig;

    constructor() {
        this.currentDir = process.cwd();
        this.appConfig = loadAppConfig();
    }

    // 获取环境配置
    private getEnvironments(): Record<string, EnvironmentConfig> {
        return this.appConfig.environments;
    }

    // 获取COS配置
    private getCosConfig(): COSConfig {
        return this.appConfig.cosConfig;
    }

    // 提问工具函数
    private question(prompt: string): Promise<string> {
        return new Promise((resolve) => {
            this.rl.question(prompt, resolve);
        });
    }

    // 显示文件夹列表并选择
    private async setUploadFolder(): Promise<string> {
        console.log('\n📁 文件夹:');
        console.log('  🔍 this.currentDir:' + this.currentDir);

        return this.selectedEnvironment?.localFolder || '';
    }

    // 选择环境
    private async setEnvironment(): Promise<EnvironmentConfig> {
        console.log('\n🌍 选择部署环境:' + this.appConfig.currentEnv);
        const environments = this.getEnvironments();
        return environments[this.appConfig.currentEnv];
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

        const answer = 'y'; //await this.question('\n确认开始上传？(y/n): ');
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
        const cosConfig = this.getCosConfig();
        const synchronizer = new COSSynchronizer(cosConfig, 8, 4);

        try {
            const result = await synchronizer.sync(localPath, remotePrefix, false);

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
        const cosConfig = this.getCosConfig();
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
            this.selectedEnvironment = await this.setEnvironment();

            // 2. 选择文件夹
            this.selectedFolder = await this.setUploadFolder();

            // 6. 构建远程路径
            // const remoteRootDir = this.versionName
            //     ? `${this.versionName}/${this.selectedFolder}`
            //     : this.selectedFolder;

            console.log("this.selectedEnvironment.prefix:", this.selectedEnvironment.prefix);
            const remotePrefix = `${this.selectedEnvironment.prefix}`;
            const localPath = join(this.currentDir, this.selectedFolder);
            const md5CachePath = join(this.currentDir, `${this.selectedFolder}.md5cache.json`);

            // 7. 确认操作
            const confirmed = await this.confirmOperation({
                environment: this.selectedEnvironment.name,
                folder: this.selectedFolder,
                version: this.versionName,
                remotePath: remotePrefix
            });

            if (!confirmed) {
                console.log('❌ 操作已取消');
                this.rl.close();
                return;
            }

            // 8. 执行同步
            await this.performSync(remotePrefix, localPath, md5CachePath);

            //   // 9. 刷新CDN缓存
            //   const targetUrl = `${this.selectedEnvironment.cdnUrl}/${remotePrefix}/`;
            //   await this.flushCDNCache(targetUrl, this.selectedEnvironment.zoneId);

            //   console.log('\n🎉 操作完成！');

        } catch (error) {
            console.error('💥 程序执行出错:', error);
        } finally {
            this.rl.close();
        }
    }

    // 延迟函数
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 启动程序
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log(`🚀 启动 ${process.argv[1]}`);
    const cli = new InteractiveCLI();
    cli.run().catch(console.error);
}

export { InteractiveCLI };