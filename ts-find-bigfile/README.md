# TS Find Big File

一个TypeScript程序，用于查找`targetDir`目录下大于`fileSize`MB的文件。

## 使用方法

### 1. 安装依赖
```bash
npm install
```

### 2. 运行程序
```bash
# 方式1: 使用npm脚本
npm start

# 方式2: 直接运行
node run.js

# 方式3: 开发模式 (需要ts-node)
npm run dev
```

### 3. 查看结果
程序会生成 `reportFile` 文件，包含所有大于`fileSize`MB的文件信息。

## 功能特点

- 递归扫描`targetDir`目录及其所有子目录
- 查找大于`fileSize`MB的文件
- 按文件大小降序排列
- 生成详细的报告文件
- 支持中英文文件路径

## 输出格式

报告文件包含以下信息：
- 文件名
- 完整路径  
- 文件大小 (多种单位显示)
- 扫描时间