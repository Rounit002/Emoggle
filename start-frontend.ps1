$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendRoot = Join-Path $projectRoot "frontend"
Set-Location $frontendRoot
npm.cmd run dev -- -p 3000 *> (Join-Path $frontendRoot "frontend.log")
