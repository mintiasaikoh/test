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

$PaletteInstalled = $false
$paletteDirs = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Derivative') -Directory -Filter 'TouchDesigner*' -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName 'Palette' } | Where-Object { Test-Path $_ }
foreach ($palette in $paletteDirs) {
    Copy-Item (Join-Path $Dir 'td\mcp_bridge.tox') $palette -Force
    Write-Host "==> mcp_bridge.tox をパレットにコピーしました: $palette"
    $PaletteInstalled = $true
}

$distPath = Join-Path $Dir 'dist\index.js'
if (Get-Command claude -ErrorAction SilentlyContinue) {
    Write-Host '==> Claude Code に MCP サーバーを登録します (全プロジェクト共通)'
    claude mcp remove touchdesigner 2>$null | Out-Null
    claude mcp remove --scope user touchdesigner 2>$null | Out-Null
    claude mcp add --scope user touchdesigner -- node $distPath
} else {
    Write-Host ''
    Write-Host 'claude CLI が見つからなかったので、手動で登録してください:'
    Write-Host "  claude mcp add touchdesigner -- node `"$distPath`""
}

Write-Host ''
Write-Host "✅ インストール完了: $Dir"
Write-Host ''
Write-Host '残りは TouchDesigner 側の1ステップだけ:'
if ($PaletteInstalled) {
    Write-Host '  パレット (My Components) から mcp_bridge をネットワークにドラッグ&ドロップ。'
    Write-Host '  プロジェクトを保存すれば、次回以降は開くだけで接続できます。'
} else {
    Write-Host "  $Dir\td\mcp_bridge.tox をネットワークにドラッグ&ドロップ。"
    Write-Host "  (または Textport (Alt+T) に $Dir\td\setup_mcp.py の中身をペーストして実行)"
}
Write-Host ''
Write-Host 'あとは Claude に「td_info で TouchDesigner につながってるか確認して」と頼んでください。'
