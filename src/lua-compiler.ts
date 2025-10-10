import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Lua编译器路径
const LUAC_PATH = path.join(__dirname, '..', 'lua', 'luac.exe');

/**
 * 递归查找所有lua文件
 */
function findLuaFiles(dir: string): string[] {
    const files: string[] = [];
    
    function traverse(currentDir: string) {
        const items = fs.readdirSync(currentDir);
        
        for (const item of items) {
            const fullPath = path.join(currentDir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                traverse(fullPath);
            } else if (item.endsWith('.lua')) {
                files.push(fullPath);
            }
        }
    }
    
    traverse(dir);
    return files;
}

/**
 * 确保目标目录存在
 */
function ensureDirectoryExists(dir: string) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * 编译单个lua文件
 */
async function compileLuaFile(sourcePath: string, targetDir: string): Promise<void> {
    // 计算相对路径以保持目录结构
    const relativePath = path.relative(path.join(__dirname, '..', 'logic'), sourcePath);
    const targetPath = path.join(targetDir, relativePath.replace(/\.lua$/, '.lc'));
    
    // 确保目标目录存在
    const targetFileDir = path.dirname(targetPath);
    ensureDirectoryExists(targetFileDir);
    
    // 执行luac编译命令
    const command = `"${LUAC_PATH}" -o "${targetPath}" "${sourcePath}"`;
    
    try {
        await execAsync(command);
        console.log(`✓ 编译成功: ${relativePath} -> ${path.relative(targetDir, targetPath)}`);
    } catch (error) {
        console.error(`✗ 编译失败: ${relativePath}`, error);
        throw error;
    }
}

/**
 * 编译所有lua文件
 */
export async function compileLuaFiles(): Promise<void> {
    const sourceDir = path.join(__dirname, '..', 'logic');
    const targetDir = path.join(__dirname, '..', 'logic-lc');
    
    // 检查luac.exe是否存在
    if (!fs.existsSync(LUAC_PATH)) {
        throw new Error(`Lua编译器不存在: ${LUAC_PATH}`);
    }
    
    // 查找所有lua文件
    const luaFiles = findLuaFiles(sourceDir);
    
    if (luaFiles.length === 0) {
        console.log('未找到任何lua文件');
        return;
    }
    
    console.log(`找到 ${luaFiles.length} 个lua文件`);
    
    // 清空目标目录
    if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
    }
    ensureDirectoryExists(targetDir);
    
    // 编译所有文件
    for (const luaFile of luaFiles) {
        await compileLuaFile(luaFile, targetDir);
    }
}