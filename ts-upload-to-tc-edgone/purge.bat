@echo off
chcp 65001 >nul

set curdir=%~dp0
set curdir=%curdir:~0,-1%

echo.
echo ========================================
echo   腾讯云 TEO 缓存刷新工具 (打包版本)
echo ========================================
echo.

:: 检查打包文件是否存在
if not exist "%curdir%\dist\bundle.js" (
    echo 错误: 打包文件不存在，请先运行 npm run build-bundle
    echo.
    pause
    exit /b 1
)

:: 执行刷新命令
echo 正在执行缓存刷新操作...
echo.
node "%curdir%\dist\bundle.js" purge

echo.
echo 操作完成！
pause