#!/usr/bin/env bash
# touchdesigner-mcp one-line installer (macOS / Linux)
#
#   curl -fsSL https://raw.githubusercontent.com/mintiasaikoh/touchdesigner-mcp/main/install.sh | bash
#
# Clones (or updates) the repo into ~/touchdesigner-mcp, builds it, and
# registers it with Claude Code if the `claude` CLI is available.
# Set TD_MCP_DIR to install somewhere else.
set -euo pipefail

REPO_URL="https://github.com/mintiasaikoh/touchdesigner-mcp.git"
DIR="${TD_MCP_DIR:-$HOME/touchdesigner-mcp}"

fail() { echo "ERROR: $1" >&2; exit 1; }

command -v git >/dev/null 2>&1 || fail "git が見つかりません。インストールしてください: https://git-scm.com"
command -v node >/dev/null 2>&1 || fail "Node.js が見つかりません。18 以上を入れてください: https://nodejs.org"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || fail "Node.js 18 以上が必要です (現在: $(node -v))"

if [ -d "$DIR/.git" ]; then
  echo "==> 既存の $DIR を更新します"
  git -C "$DIR" pull --ff-only
else
  echo "==> $DIR にクローンします"
  git clone "$REPO_URL" "$DIR"
fi

cd "$DIR"
echo "==> npm install && npm run build"
npm install
npm run build

PALETTE_INSTALLED=0
if [ "$(uname)" = "Darwin" ]; then
  for palette in "$HOME/Library/Application Support/Derivative"/TouchDesigner*/Palette; do
    if [ -d "$palette" ]; then
      cp "$DIR/td/mcp_bridge.tox" "$palette/"
      echo "==> mcp_bridge.tox をパレットにコピーしました: $palette"
      PALETTE_INSTALLED=1
    fi
  done
fi

if command -v claude >/dev/null 2>&1; then
  echo "==> Claude Code に MCP サーバーを登録します (全プロジェクト共通)"
  claude mcp remove touchdesigner >/dev/null 2>&1 || true
  claude mcp remove --scope user touchdesigner >/dev/null 2>&1 || true
  claude mcp add --scope user touchdesigner -- node "$DIR/dist/index.js"
else
  cat <<EOF

claude CLI が見つからなかったので、手動で登録してください。

Claude Code:
  claude mcp add touchdesigner -- node "$DIR/dist/index.js"

Claude Desktop (claude_desktop_config.json):
  {
    "mcpServers": {
      "touchdesigner": {
        "command": "node",
        "args": ["$DIR/dist/index.js"]
      }
    }
  }
EOF
fi

cat <<EOF

✅ インストール完了: $DIR

残りは TouchDesigner 側の1ステップだけ:
EOF

if [ "$PALETTE_INSTALLED" = "1" ]; then
  cat <<EOF
  パレット (My Components) から mcp_bridge をネットワークにドラッグ&ドロップ。
  プロジェクトを保存すれば、次回以降は開くだけで接続できます。
EOF
else
  cat <<EOF
  $DIR/td/mcp_bridge.tox をネットワークにドラッグ&ドロップ。
  (または Textport (Alt+T) に $DIR/td/setup_mcp.py の中身をペーストして実行)
EOF
fi

cat <<EOF

あとは Claude に「td_info で TouchDesigner につながってるか確認して」と頼んでください。
EOF
