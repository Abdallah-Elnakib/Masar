@echo off
echo ========================================
echo Full Deployment Pipeline
echo ========================================
echo.

REM Ask for version bump
set /p NEW_VERSION="Enter new version (e.g., 0.3.0): "

REM Check for GitHub token
if "%GITHUB_TOKEN%"=="" (
    echo.
    echo ERROR: GITHUB_TOKEN environment variable is not set.
    echo Please set it before running this script:
    echo set GITHUB_TOKEN=your_github_token
    pause
    exit /b 1
)

REM Update version in package.json using Node.js
echo.
echo Step 1: Updating version in package.json...
node -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); pkg.version = '%NEW_VERSION%'; fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));"

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
set GH_TOKEN=%GITHUB_TOKEN%
call npm run package:win
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)

REM Commit and push to GitHub
echo.
echo Step 4: Committing and pushing to GitHub...
git add package.json
git commit -m "Bump version to %NEW_VERSION%"
git push

REM Create GitHub release and upload files
echo.
echo Step 5: Creating GitHub release and uploading files...
"C:\Program Files\GitHub CLI\gh.exe" release create v%NEW_VERSION% --notes "Release version %NEW_VERSION%"
"C:\Program Files\GitHub CLI\gh.exe" release upload v%NEW_VERSION% "release\Northstar Quality Operations Setup %NEW_VERSION%.exe" --clobber

REM Update latest.yml with FULL URL
echo.
echo Step 5.5: Updating latest.yml with FULL URL...
if not exist updates mkdir updates
node -e "const fs = require('fs'); const yml = fs.readFileSync('release/latest.yml', 'utf8'); const updated = yml.replace(/url: Northstar Quality Operations Setup ([0-9.]+).exe/g, 'url: https://github.com/Abdallah-Elnakib/Masar/releases/download/v%NEW_VERSION%/Northstar Quality Operations Setup %NEW_VERSION%.exe').replace(/path: Northstar Quality Operations Setup ([0-9.]+).exe/g, 'path: Northstar Quality Operations Setup %NEW_VERSION%.exe'); fs.writeFileSync('updates/latest.yml', updated);"

"C:\Program Files\GitHub CLI\gh.exe" release upload v%NEW_VERSION% "updates/latest.yml" --clobber

echo.
echo ========================================
echo Deployment complete!
echo ========================================
echo.
echo Version: %NEW_VERSION%
echo GitHub: https://github.com/Abdallah-Elnakib/Masar/releases
echo.
pause
