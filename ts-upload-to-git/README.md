# Git批量提交工具

一个使用Git命令将大量文件分批提交到GitHub仓库的TypeScript工具。

## 功能特点

- ✅ 自动初始化Git仓库
- ✅ 配置远程GitHub仓库  
- ✅ 分批提交文件（默认每批1000个）
- ✅ 自动推送到远程仓库
- ✅ 详细的进度显示和错误处理

## 安装和使用

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
复制 `.env.example` 为 `.env` 并填写你的GitHub信息：
```bash
copy .env.example .env
```

编辑 `.env` 文件：
```env
GITHUB_REPO_URL=https://github.com/your_username/your_repository.git
GIT_USERNAME=your_github_username
GIT_EMAIL=your_email@example.com
BATCH_SIZE=1000
SOURCE_DIR=./files_to_upload
COMMIT_MESSAGE_PREFIX=Add files batch
```

### 3. 准备要提交的文件
将要提交的文件放在 `files_to_upload` 目录中。

### 4. 运行程序
```bash
# 开发模式
npm run dev

# 构建后运行
npm run build
npm start
```

## 配置选项

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| GITHUB_REPO_URL | GitHub仓库HTTPS URL | 必填 |
| GIT_USERNAME | GitHub用户名 | 必填 |
| GIT_EMAIL | Git提交使用的邮箱 | 必填 |
| BATCH_SIZE | 每批提交的文件数量 | 1000 |
| SOURCE_DIR | 源文件目录 | ./files_to_upload |

## 系统要求

- Node.js 14+
- Git已安装并配置
- 对目标GitHub仓库有推送权限

## 注意事项

- 确保目标GitHub仓库已存在
- 程序会自动初始化Git仓库和配置远程
- 如果遇到权限问题，请检查GitHub访问令牌或SSH密钥