# touchdesigner-mcp one-line installer (Windows PowerShell)
#
#   irm https://raw.githubusercontent.com/mintiasaikoh/touchdesigner-mcp/main/install.ps1 | iex
#
# Clones (or updates) the repo into $HOME\touchdesigner-mcp, builds it, and
# registers it with Claude Code if the `claude` CLI is available.
$ErrorActionPreference = 'Stop'

$RepoUrl = 'https://github.com/mintiasaikoh/touchdesigner-mcp.git'
$Dir = if ($env:TD_MCP_DIR) { $env:TD_MCP_DIR } else { Join-Path $HOME 'touchdesigner-mcp' }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'git が見つかりません。インストールしてください: https://git-scm.com'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js が見つかりません。18 以上を入れてください: https://nodejs.org'
}
$nodeMajor = [int](node -p 'process.versions.node.split(".")[0]')
if ($nodeMajor -lt 18) { throw "Node.js 18 以上が必要です (現在: $(node -v))" }

if (Test-Path (Join-Path $Dir '.git')) {
    Write-Host "==> 既存の $Dir を更新します"
    git -C $Dir pull --ff-only
} else {
    Write-Host "==> $Dir にクローンします"
    git clone $RepoUrl $Dir
}

Set-Location $Dir
Write-Host '==> npm install && npm run build'
npm install
npm run build

$distPath = Join-Path $Dir 'dist\index.js'
if (Get-Command claude -ErrorAction SilentlyContinue) {
    Write-Host '==> Claude Code に MCP サーバーを登録します'
    claude mcp remove touchdesigner 2>$null | Out-Null
    claude mcp add touchdesigner -- node $distPath
} else {
    Write-Host ''
    Write-Host 'claude CLI が見つからなかったので、手動で登録してください:'
    Write-Host "  claude mcp add touchdesigner -- node `"$distPath`""
}

Write-Host ''
Write-Host "✅ インストール完了: $Dir"
Write-Host ''
Write-Host '残りは TouchDesigner 側の1ステップだけ:'
Write-Host '  1. TouchDesigner で Alt+T (Dialogs > Textport and DATs) を開く'
Write-Host "  2. $Dir\td\setup_mcp.py の中身を丸ごとペーストして Enter"
Write-Host '  3. "Listening on http://127.0.0.1:9981" と出ればOK'
