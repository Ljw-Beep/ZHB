@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================
echo   把记账本代码推送到 GitHub
echo ================================================
echo.
echo 第一次推送会弹出 GitHub 登录窗口（浏览器或账号密码），
echo 登录一次之后就不会再问了。
echo.
echo 目标仓库：https://github.com/Ljw-Beep/ZHB
echo.
pause
echo.
git push -u origin main --force
echo.
if %errorlevel%==0 (
  echo 推送成功！
  echo.
  echo 接下来打开仓库 Settings - Pages：
  echo   Source 选 Deploy from a branch
  echo   Branch 选 main，目录选 /docs
  echo   保存后等 1 分钟，访问 https://ljw-beep.github.io/ZHB/
) else (
  echo.
  echo 推送失败，请检查：
  echo   1. 是否在弹窗里登录了 GitHub 账号
  echo   2. 网络是否正常
  echo   3. 把上面的红色错误信息截图给我
)
echo.
pause
