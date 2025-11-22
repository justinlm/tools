const { spawn } = require('child_process');

console.log('正在编译TypeScript程序...');

// 编译TypeScript
const tsc = spawn('npx', ['tsc'], { stdio: 'inherit' });

tsc.on('close', (code) => {
    if (code === 0) {
        console.log('编译成功，开始执行程序...');
        // 运行编译后的程序
        const node = spawn('node', ['dist/index.js'], { stdio: 'inherit' });
    } else {
        console.error('编译失败');
    }
});