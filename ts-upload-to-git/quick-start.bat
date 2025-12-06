@echo off
echo GitHub Batch Uploader - Quick Start
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Please install Node.js first
    echo Visit https://nodejs.org/ to download and install
    pause
    exit /b 1
)


REM Install dependencies
REM echo Installing dependencies...
REM npm install

REM Copy environment variables template
if not exist ".env" (
    copy .env.example .env
    echo.
    echo Created .env file, please edit it with your GitHub information
    echo.
)

echo.
echo Setup completed!
echo.
echo Next steps:
echo 1. Edit .env file with your GitHub information
echo 2. Put files to upload in the files_to_upload directory
echo 3. Run: npm run dev
echo.
pause