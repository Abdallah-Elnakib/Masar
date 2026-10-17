@echo off
echo ========================================
echo Full Deployment Pipeline
echo ========================================
echo.

REM Ask for version bump
set /p NEW_VERSION="Enter new version (e.g., 0.3.0): "

REM Update version in package.json
echo.
echo Step 1: Updating version in package.json...
powershell -Command "(Get-Content package.json) -replace '\"version\": \"[^\"]+\"', '\"version\": \"%NEW_VERSION%\"' | Set-Content package.json"

REM Build the app
echo.
echo Step 2: Building app...
call npm run build
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)

REM Build installer
echo.
echo Step 3: Building installer...
call npm run package:win
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)

REM Create updates directory
echo.
echo Step 4: Creating updates directory...
if not exist updates mkdir updates

REM Copy files to updates directory
echo.
echo Step 5: Copying files to updates directory...
copy release\*.exe updates\
copy release\*.yml updates\

REM Commit and push to GitHub
echo.
echo Step 6: Committing and pushing to GitHub...
git add .
git commit -m "Bump version to %NEW_VERSION%"
git push

REM Deploy to Vercel
echo.
echo Step 7: Deploying to Vercel...
call vercel --prod

echo.
echo ========================================
echo Deployment complete!
echo ========================================
echo.
echo Version: %NEW_VERSION%
echo GitHub: https://github.com/Abdallah-Elnakib/Masar
echo Updates: https://masar-indol-nine.vercel.app/updates
echo.
pause
