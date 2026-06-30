function Install-Node {
    $nodeVersion = node -v 2>$null
    if ($nodeVersion -like "v*") {
        Write-Host "Node.js is already installed: $nodeVersion" -ForegroundColor Green
    } else {
        Write-Host "Installing Node.js v22.12.0 ..." -ForegroundColor Yellow
        $nodeInstaller = "https://nodejs.org/dist/v22.12.0/node-v22.12.0-x64.msi"
        $installerPath = "$env:TEMP\nodejs-installer.msi"
        Invoke-WebRequest -Uri $nodeInstaller -OutFile $installerPath
        Start-Process msiexec.exe -ArgumentList "/i $installerPath /quiet /norestart" -Wait
        Remove-Item $installerPath
        Write-Host "Node.js has been successfully installed." -ForegroundColor Green
    }
}

function Install-Git {
    $gitVersion = git --version 2>$null
    if ($gitVersion -like "git version *") {
        Write-Host "Git is already installed: $gitVersion" -ForegroundColor Green
    } else {
        Write-Host "Installing Git..." -ForegroundColor Yellow
        $latest = Invoke-RestMethod -Uri "https://api.github.com/repos/git-for-windows/git/releases/latest"
        $installer = $latest.assets | Where-Object { $_.name -like "Git-*-64-bit.exe" } | Select-Object -First 1
        if (-not $installer) {
            Write-Host "Could not find latest Git installer via API. Downloading fallback version..." -ForegroundColor Red
            $gitInstaller = "https://github.com/git-for-windows/git/releases/download/v2.48.0.windows.1/Git-2.48.0-64-bit.exe"
        } else {
            $gitInstaller = $installer.browser_download_url
            Write-Host "Downloading $($installer.name)..." -ForegroundColor Yellow
        }
        $installerPath = "$env:TEMP\git-installer.exe"
        Invoke-WebRequest -Uri $gitInstaller -OutFile $installerPath
        Start-Process $installerPath -ArgumentList "/SILENT" -Wait
        Remove-Item $installerPath
        Write-Host "Git has been successfully installed." -ForegroundColor Green
    }
}

function Install-Pnpm {
    $pnpmVersion = pnpm -v 2>$null
    if ($pnpmVersion) {
        Write-Host "pnpm is already installed: v$pnpmVersion" -ForegroundColor Green
    } else {
        Write-Host "Installing pnpm..." -ForegroundColor Yellow
        npm install -g pnpm
        Write-Host "pnpm has been successfully installed." -ForegroundColor Green
    }
}

function Clone-Project {
    $desktopPath = [Environment]::GetFolderPath("Desktop")
    $repoPath = Join-Path $desktopPath "owofarmbot_stable"

    if (Test-Path $repoPath) {
        Write-Host "The project is already cloned at $repoPath." -ForegroundColor Green
    } else {
        Write-Host "Cloning the repository..." -ForegroundColor Yellow
        git clone https://github.com/Mid0Hub/owofarmbot_stable $repoPath
        Write-Host "Repository cloned successfully." -ForegroundColor Green
    }

    Write-Host "Entering the project directory and installing dependencies..." -ForegroundColor Yellow
    Set-Location $repoPath
    pnpm install
    Write-Host "Dependencies installed successfully." -ForegroundColor Green
}

Install-Node
Install-Git
Install-Pnpm
Clone-Project

Write-Host "Everything is ready. Please type 'node src/main.js' in owofarmbot_stable folder" -ForegroundColor Cyan
