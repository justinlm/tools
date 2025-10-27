import { createHash } from 'crypto';
import { statSync, readdirSync, lstatSync, promises as fsPromises, existsSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { AppConfig } from './types';

export function normalizePrefix(prefix: string): string {
  if (!prefix) return '';
  return prefix.endsWith('/') ? prefix : prefix + '/';
}

export function formatSize(bytes: number): string {
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

export function cacheKeyForPath(path: string): string {
  try {
    const stat = statSync(path);
    return `${path}|${Math.floor(stat.mtime.getTime() / 1000)}|${stat.size}`;
  } catch {
    return `${path}|0|0`;
  }
}

export async function computeFileMD5(filePath: string, chunkSize: number = 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('md5');
    const fs = require('fs');
    const stream = fs.createReadStream(filePath, { highWaterMark: chunkSize });

    stream.on('data', (chunk: Buffer) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export function scanLocalDirectory(localDir: string, prefix: string): Map<string, { path: string; size: number }> {
  const localMap = new Map<string, { path: string; size: number }>();
  const prefixNorm = normalizePrefix(prefix);
  const base = require('path').resolve(localDir);

  function scanDirectory(dir: string) {
    const items = readdirSync(dir);

    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = lstatSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (stat.isFile()) {
        const relPath = relative(base, fullPath).replace(/\\/g, '/');
        const key = prefixNorm + relPath;
        localMap.set(key, {
          path: fullPath,
          size: stat.size
        });
      }
    }
  }

  scanDirectory(base);
  return localMap;
}

export async function readLocalFile(filePath: string): Promise<string> {
  try {
    return await fsPromises.readFile(filePath, 'utf-8');
  } catch (error) {
    console.error('[Local] Failed to read file:', error);
    return '';
  }
}


// 加载配置文件
export function loadAppConfig(): AppConfig {
  const configPath = join(process.cwd(), 'app-config.json');

  if (!existsSync(configPath)) {
    console.error('❌ 配置文件不存在:', configPath);
    console.log('💡 请创建 app-config.json 文件并配置 COS 和环境信息');
    process.exit(1);
  }

  try {
    const configContent = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent) as AppConfig;

    // 验证配置完整性
    if (!config.cosConfig || !config.environments) {
      throw new Error('配置文件格式错误，缺少必要的配置项');
    }

    return config;
  } catch (error) {
    console.error('❌ 配置文件读取失败:', error);
    process.exit(1);
  }
}
