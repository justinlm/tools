@echo off
echo Testing Git batch committer...
echo.

echo 1. Checking Git installation...
git --version >nul 2>&1
if errorlevel 1 (
    echo Error: Git not found. Please install Git first.
    echo Download from: https://git-scm.com/
    pause
    exit /b 1
)

echo Git is installed.

echo.
echo 2. Building TypeScript...
npm run build

if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)

echo.
echo 3. Testing with sample files...
echo Please make sure you have configured .env file with your GitHub repository info.
echo.
echo Ready to run: npm run dev
pause