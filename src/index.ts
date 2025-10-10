import { compileLuaFiles } from './lua-compiler';

async function main() {
    console.log('开始编译Lua文件...');
    
    try {
        await compileLuaFiles();
        console.log('Lua文件编译完成！');
    } catch (error) {
        console.error('编译过程中出现错误:', error);
        process.exit(1);
    }
}

main();