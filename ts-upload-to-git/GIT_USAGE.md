# Git批量提交工具使用说明

这个工具使用Git命令将文件批量提交到GitHub仓库，而不是通过GitHub API上传。

## 功能特点

- ✅ 自动初始化Git仓库
- ✅ 配置远程GitHub仓库
- ✅ 分批提交文件（默认每批1000个）
- ✅ 自动推送到远程仓库
- ✅ 详细的进度显示

## 配置要求

### 1. 安装Git
确保系统已安装Git：
```bash
git --version
```

### 2. 配置环境变量
编辑 `.env` 文件：
```env
GITHUB_REPO_URL=https://github.com/your_username/your_repository.git
GIT_USERNAME=your_github_username
GIT_EMAIL=your_email@example.com
BATCH_SIZE=1000
SOURCE_DIR=./files_to_upload
COMMIT_MESSAGE_PREFIX=Add files batch
```

### 3. 准备GitHub仓库
- 在GitHub上创建空仓库
- 获取仓库的HTTPS URL
- 确保你有推送权限

## 使用步骤

1. **准备文件**：将要提交的文件放在 `files_to_upload` 目录
2. **配置环境**：编辑 `.env` 文件中的GitHub信息
3. **运行程序**：
   ```bash
   npm run dev
   ```

## 程序执行流程

1. **初始化Git仓库**：在源目录中初始化Git
2. **配置远程仓库**：添加GitHub仓库作为远程源
3. **扫描文件**：获取所有要提交的文件
4. **分批提交**：每批提交指定数量的文件
5. **推送到GitHub**：将所有提交推送到远程仓库

## 注意事项

- 确保目标GitHub仓库已存在且为空
- 程序会自动创建Git仓库和配置远程
- 如果仓库已存在文件，可能需要先拉取更新
- 建议先在小批量文件上测试