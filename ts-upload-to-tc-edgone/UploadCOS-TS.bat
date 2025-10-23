@echo off
chcp 65001 >nul

set curdir=%~dp0
set curdir=%curdir:~0,-1%

:: 选择本地文件夹
echo.
setlocal enabledelayedexpansion
set num=1
for /f "tokens=1*" %%i in ('dir /a:d /b "%curdir%"') do (
    echo  !num!. %%i%%j
    set select[!num!]=%%i%%j
    set /a num=!num!+1
)
set num_end=%num%
echo.
:root_dir
set /p num=Select a folder for sync to COS: 
if "%num%"=="" goto root_dir
if /i %num% lss 1 goto root_dir
if /i %num% geq %num_end% goto root_dir
set selected_root=!select[%num%]!
(endlocal & set selected_root=%selected_root%)

:: 配置参数
set zone_id=zone-3b1eze7s0k4x
set cdnurl=http://gcdn01.sandboxol.com
set prefix=g5006
set rootdir=%selected_root%

:: 选择上传的版本
echo.
:ver_dir
set /p verdir=Set a name for Version sub folder: 
set verrootdir=%rootdir%
if not "%verdir%"=="" set verrootdir=%verdir%/%rootdir%
echo.
echo 远端操作根目录: %prefix%/%verrootdir%

:: 执行同步
echo.
pause
node "%curdir%\dist\index.js" sync --prefix="%prefix%/%verrootdir%" --local="%curdir%/%rootdir%" --threads 8 --md5-cache "%curdir%\%rootdir%.md5cache.json"

:end
echo.
echo 操作完成！
pause