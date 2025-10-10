# TypeScript Lua编译器

这个项目使用TypeScript编写，用于将logic目录下的lua文件编译为字节码到logic-lc目录。

## 使用方法

### 1. 安装依赖
```bash
npm install
```

### 2. 编译lua文件
```bash
# 直接运行（使用ts-node）
npm run compile-lua

# 或者先编译TypeScript，再运行
npm run build-and-compile

```

### 3. 查看结果
编译后的lua字节码文件将保存在 `logic-lc` 目录中，保持原有的目录结构。

## 项目结构

- `src/` - TypeScript源代码
  - `index.ts` - 主入口文件
  - `lua-compiler.ts` - Lua编译器模块
- `logic/` - 原始lua文件
- `logic-lc/` - 编译后的lua字节码文件
- `lua/` - Lua编译器 (luac.exe)

## 功能特点

- 递归查找所有lua文件
- 保持原有的目录结构
- 错误处理和日志输出
- 支持批量编译