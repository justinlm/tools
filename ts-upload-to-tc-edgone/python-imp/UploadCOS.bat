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

:: 拼接路径
set zone_id=zone-3b1eze7s0k4x
set cdnurl=http://gcdn01.sandboxol.com
set prefix=g5006
set rootdir=%selected_root%

:: 列举已有版本
echo.
python "%curdir%\TencentCOS.py" --action=list --prefix="%prefix%"

:: 显示本地版本
echo.
echo 本地CDN配置：
type "%curdir%\..\Assets\Res\Boot\Address.bson" | findstr "cdnUrl"
echo.
echo 本地区服配置：
type "%curdir%\..\Assets\Res\Config\Region.bson" | findstr "id name"
type "%curdir%\..\Assets\Res\Config\Region.bson" | findstr "recommendRegionId"

:: 选择上传的版本
echo.
:ver_dir
set /p verdir=Set a name for Version sub folder: 
set verrootdir=%rootdir%
if not "%verdir%"=="" set verrootdir=%verdir%/%rootdir%
echo.
echo 远端操作根目录: %prefix%/%verrootdir%

:: 执行操作
echo.
pause
python "%curdir%\TencentCOS.py" --action=sync --prefix="%prefix%/%verrootdir%" --local="%curdir%/%rootdir%" --threads 8 --md5-cache "%curdir%\%rootdir%.md5cache.json"

:: 刷新缓存
echo.
python "%curdir%\TencentCOS.py" --action=flush --zone-id="%zone_id%" --target="%cdnurl%/%prefix%/%verrootdir%/"

:: 清理冗余文件
echo.
set /p op_select=是否需要清理远端冗余文件？ (y/n): 
if "%op_select%"=="y" (
    echo 清理缓存建议在真正刷新缓存成功后进行，否则可能会导致缓存失效。 
    echo 清理操作将在30秒后执行。 
    timeout /t 30 /nobreak >nul
    python "%curdir%\TencentCOS.py" --action=sync --prefix="%prefix%/%verrootdir%" --threads 8 --delete
)

:end
echo.
echo 操作完成！
pause
