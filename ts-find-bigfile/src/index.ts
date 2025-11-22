import * as fs from 'fs';
import * as path from 'path';

// 读取配置文件
const CONFIG_PATH = path.join(__dirname, 'config.json');

interface Config {
    fileSize: number;
    targetDir: string;
    reportFile: string;
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
        fileSize: config.fileSize,
        targetDir: path.resolve(__dirname, config.targetDir),
        reportFile: path.resolve(__dirname, config.reportFile)
    };
}

interface BigFileInfo {
    name: string;
    size: number;
    sizeMB: number;
    path: string;
}

function formatFileSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

function findBigFiles(dirPath: string, threshold: number): BigFileInfo[] {
    const bigFiles: BigFileInfo[] = [];

    function traverseDirectory(currentPath: string) {
        try {
            const items = fs.readdirSync(currentPath);

            for (const item of items) {
                const fullPath = path.join(currentPath, item);
                const stats = fs.statSync(fullPath);

                if (stats.isDirectory()) {
                    traverseDirectory(fullPath);
                } else if (stats.isFile() && stats.size > threshold) {
                    bigFiles.push({
                        name: item,
                        size: stats.size,
                        sizeMB: Math.round(stats.size / (1024 * 1024) * 100) / 100,
                        path: fullPath
                    });
                }
            }
        } catch (error) {
            console.error(`Error reading directory ${currentPath}:`, error);
        }
    }

    traverseDirectory(dirPath);
    return bigFiles.sort((a, b) => b.size - a.size);
}

function saveResultsToFile(files: BigFileInfo[], outputPath: string): void {
    const content = files.map(file =>
        `文件名: ${file.name}\n` +
        `路径: ${file.path}\n` +
        `大小: ${formatFileSize(file.size)} (${file.sizeMB} MB)\n` +
        `---\n`
    ).join('\n');

    const header = `找到 ${files.length} 个大于95MB的文件:\n\n`;
    const fullContent = header + content;

    fs.writeFileSync(outputPath, fullContent, 'utf8');
    console.log(`结果已保存到: ${outputPath}`);
}

function main() {

    const config = loadConfig();

    const assetsDir = config.targetDir;
    const outputFile = config.reportFile;
    const fileSize = config.fileSize * 1024 * 1024;

    console.log('开始扫描assets目录...');
    console.log(`目标目录: ${assetsDir}`);
    console.log(`大小阈值: ${config.fileSize}MB (${fileSize} bytes)\n`);

    if (!fs.existsSync(assetsDir)) {
        console.error(`错误: assets目录不存在: ${assetsDir}`);
        return;
    }

    const bigFiles = findBigFiles(assetsDir, fileSize);

    if (bigFiles.length === 0) {
        console.log(`未找到大于${config.fileSize}MB的文件。`);
        const content = '扫描时间: ' + new Date().toLocaleString() + '\n' +
            `未找到大于${config.fileSize}MB的文件。\n` +
            `扫描目录: ${assetsDir}\n` +
            `大小阈值: ${config.fileSize}MB`;
        fs.writeFileSync(outputFile, content, 'utf8');
        console.log(`空结果已保存到: ${outputFile}`);
    } else {
        console.log(`找到 ${bigFiles.length} 个大于${config.fileSize}MB的文件:`);
        bigFiles.forEach((file, index) => {
            console.log(`${index + 1}. ${file.name} - ${formatFileSize(file.size)}`);
        });

        saveResultsToFile(bigFiles, outputFile);
    }
}

// 运行程序
main();