import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 读取配置文件
const CONFIG_PATH = path.join(__dirname, 'luac-config.json');

interface Config {
    luacPath: string;
    sourceDir: string;
    targetDir: string;
}

function loadConfig(): Config {
    if (!fs.existsSync(CONFIG_PATH)) {
        throw new Error(`配置文件不存在: ${CONFIG_PATH}`);
    }
    
    const configContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(configContent) as Config;
    
    // 将相对路径转换为绝对路径
    // const projectRoot = path.join(__dirname, '..');
    return {
        luacPath: path.resolve(__dirname, config.luacPath),
        sourceDir: path.resolve(__dirname, config.sourceDir),
        targetDir: path.resolve(__dirname, config.targetDir)
    };
}

const config = loadConfig();
const LUAC_PATH = config.luacPath;

/**
 * 递归查找所有文件，返回包含文件路径和类型的对象数组
 */
interface FileInfo {
    path: string;
    isLua: boolean;
    relativePath: string;
}

function findAllFiles(dir: string): FileInfo[] {
    const files: FileInfo[] = [];
    
    function traverse(currentDir: string) {
        const items = fs.readdirSync(currentDir);
        
        for (const item of items) {
            const fullPath = path.join(currentDir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                traverse(fullPath);
            } else {
                const relativePath = path.relative(dir, fullPath);
                const isLua = item.endsWith('.lua');
                files.push({
                    path: fullPath,
                    isLua: isLua,
                    relativePath: relativePath
                });
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
async function compileLuaFile(sourcePath: string, targetDir: string, relativePath: string): Promise<void> {
    const targetPath = path.join(targetDir, relativePath.replace(/\.lua$/, '.lua'));
    
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
 * 复制单个非lua文件
 */
function copyNonLuaFile(sourcePath: string, targetDir: string, relativePath: string): void {
    const targetPath = path.join(targetDir, relativePath);
    
    // 确保目标目录存在
    const targetFileDir = path.dirname(targetPath);
    ensureDirectoryExists(targetFileDir);
    
    try {
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`✓ 复制成功: ${relativePath}`);
    } catch (error) {
        console.error(`✗ 复制失败: ${relativePath}`, error);
        throw error;
    }
}

/**
 * 编译所有lua文件并复制非lua文件
 */
export async function compileLuaFiles(): Promise<void> {
    const sourceDir = config.sourceDir;
    const targetDir = config.targetDir;
    
    // 检查luac.exe是否存在
    if (!fs.existsSync(LUAC_PATH)) {
        throw new Error(`Lua编译器不存在: ${LUAC_PATH}`);
    }
    
    // 查找所有文件
    const allFiles = findAllFiles(sourceDir);
    
    if (allFiles.length === 0) {
        console.log('未找到任何文件');
        return;
    }
    
    // 分离lua文件和非lua文件
    const luaFiles = allFiles.filter(file => file.isLua);
    const nonLuaFiles = allFiles.filter(file => !file.isLua);
    
    console.log(`找到 ${allFiles.length} 个文件`);
    console.log(`- Lua文件: ${luaFiles.length} 个`);
    console.log(`- 非Lua文件: ${nonLuaFiles.length} 个`);
    
    // 清空目标目录
    if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
    }
    ensureDirectoryExists(targetDir);
    
    // 先复制非lua文件
    if (nonLuaFiles.length > 0) {
        console.log('\n开始复制非lua文件...');
        for (const fileInfo of nonLuaFiles) {
            copyNonLuaFile(fileInfo.path, targetDir, fileInfo.relativePath);
        }
    }
    
    // 编译lua文件
    if (luaFiles.length > 0) {
        console.log('\n开始编译lua文件...');
        for (const fileInfo of luaFiles) {
            await compileLuaFile(fileInfo.path, targetDir, fileInfo.relativePath);
        }
    }
    
    console.log('\n✅ 所有文件处理完成！');
}