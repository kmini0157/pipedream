@echo off
rem Creates a desktop shortcut for Second Brain (run once, Windows).
setlocal EnableExtensions
chcp 65001 >nul

set "LAUNCHER=%~dp0start.bat"
set "WORKDIR=%~dp0.."

rem Use PowerShell for the real Desktop path (handles OneDrive-redirected
rem desktops) and to write the .lnk shortcut. Paths are passed via environment
rem variables ($env:...) — never inlined into PS string literals — so folders
rem with spaces or apostrophes (O'Brien) can't break the quoting.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$sc = $ws.CreateShortcut((Join-Path $desktop 'Second Brain.lnk'));" ^
  "$sc.TargetPath = $env:LAUNCHER;" ^
  "$sc.WorkingDirectory = $env:WORKDIR;" ^
  "$sc.Description = 'Second Brain - 개인 지식 레이어';" ^
  "$sc.IconLocation = 'shell32.dll,13';" ^
  "$sc.Save();" ^
  "Write-Host ('바탕화면에 만들었습니다: ' + (Join-Path $desktop 'Second Brain.lnk'))"

if errorlevel 1 (
  echo ✗ 바로가기 생성 실패
) else (
  echo ✓ 완료 - 바탕화면의 "Second Brain"을 더블클릭하세요.
)
pause
