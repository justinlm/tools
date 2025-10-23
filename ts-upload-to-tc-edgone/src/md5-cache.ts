import { readFileSync, writeFileSync, existsSync } from 'fs';
import { FileInfo } from './types';

export class MD5Cache {
  static loadCache(cachePath?: string): Map<string, string> {
    if (!cachePath) return new Map();
    
    try {
      if (!existsSync(cachePath)) return new Map();
      
      const content = readFileSync(cachePath, 'utf-8');
      const data = JSON.parse(content);
      return new Map(Object.entries(data));
    } catch {
      return new Map();
    }
  }
  
  static saveCache(cachePath: string | undefined, cache: Map<string, string>): void {
    if (!cachePath) return;
    
    try {
      const data = Object.fromEntries(cache);
      writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.warn('Failed to save cache:', error);
    }
  }
  
  static cleanStaleEntries(cache: Map<string, string>, currentFiles: Set<string>): number {
    let removed = 0;
    
    for (const [cacheKey] of cache) {
      const filePath = cacheKey.split('|')[0];
      if (!currentFiles.has(filePath)) {
        cache.delete(cacheKey);
        removed++;
      }
    }
    
    if (removed > 0) {
      console.log(`Cleaned ${removed} stale entries from cache`);
    }
    
    return removed;
  }
}