#!/usr/bin/env bash
set -euo pipefail

# DreamFactory installer / uninstaller
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/stelee410/dream-factory/main/install.sh | bash
#   curl -fsSL ... | bash -s -- --uninstall

REPO="stelee410/dream-factory"
INSTALL_DIR="$HOME/.dreamfactory/bin"
WRAPPER="$INSTALL_DIR/dreamfactory"
MIN_NODE_MAJOR=20

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()  { printf "\033[1;34m==>\033[0m %s\n" "$*"; }
ok()    { printf "\033[1;32m==>\033[0m %s\n" "$*"; }
warn()  { printf "\033[1;33mWARN:\033[0m %s\n" "$*"; }
err()   { printf "\033[1;31mERROR:\033[0m %s\n" "$*" >&2; exit 1; }

link_dir() {
  if [ -w /usr/local/bin ]; then
    echo "/usr/local/bin"
  else
    mkdir -p "$HOME/.local/bin"
    echo "$HOME/.local/bin"
  fi
}

ensure_in_path() {
  local dir="$1"
  case ":$PATH:" in
    *":$dir:"*) return ;;
  esac
  warn "$dir is not in your PATH."
  echo "  Add this line to your shell profile (~/.zshrc or ~/.bashrc):"
  echo ""
  echo "    export PATH=\"$dir:\$PATH\""
  echo ""
}

# ---------------------------------------------------------------------------
# Uninstall
# ---------------------------------------------------------------------------
uninstall() {
  info "Uninstalling DreamFactory..."
  local link="$(link_dir)/dreamfactory"
  [ -L "$link" ] && rm -f "$link" && info "Removed symlink $link"
  [ -d "$INSTALL_DIR" ] && rm -rf "$INSTALL_DIR" && info "Removed $INSTALL_DIR"
  ok "DreamFactory uninstalled. (~/.dreamfactory/.env was kept)"
  exit 0
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
for arg in "$@"; do
  case "$arg" in
    --uninstall) uninstall ;;
  esac
done

info "Installing DreamFactory..."

# 1. Check Node.js
if ! command -v node >/dev/null 2>&1; then
  err "Node.js is not installed. Install Node.js >= $MIN_NODE_MAJOR first:

  # macOS (Homebrew)
  brew install node

  # Any OS (nvm)
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  nvm install $MIN_NODE_MAJOR

Then re-run this installer."
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt "$MIN_NODE_MAJOR" ]; then
  err "Node.js v$MIN_NODE_MAJOR+ is required (found v$(node -v)). Please upgrade."
fi

# 2. Fetch latest release tag
info "Fetching latest release..."
TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep '"tag_name"' | head -1 | sed 's/.*"tag_name":[[:space:]]*"\(.*\)".*/\1/')

if [ -z "${TAG:-}" ]; then
  warn "No GitHub release found, falling back to main branch tarball."
  TARBALL_URL="https://github.com/$REPO/releases/download/v0.1.0/dreamfactory.tar.gz"
  # If no release exists at all, try npm as fallback
  if ! curl -fsSL --head "$TARBALL_URL" >/dev/null 2>&1; then
    info "No release tarball found. Installing via npm instead..."
    npm install -g dreamfactory
    ok "DreamFactory installed via npm."
    exit 0
  fi
else
  info "Latest release: $TAG"
  TARBALL_URL="https://github.com/$REPO/releases/download/$TAG/dreamfactory.tar.gz"
fi

# 3. Download and extract
info "Downloading $TARBALL_URL ..."
mkdir -p "$INSTALL_DIR"
curl -fsSL "$TARBALL_URL" | tar xz -C "$INSTALL_DIR"

# 4. Create wrapper script
cat > "$WRAPPER" <<'SCRIPT'
#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));
const entry = join(__dir, "dist", "index.js");
await import(entry);
SCRIPT
chmod +x "$WRAPPER"

# Actually, the dist/index.js already has a shebang — just symlink it directly.
rm -f "$WRAPPER"

# 5. Create symlink
LINK_DIR="$(link_dir)"
ln -sf "$INSTALL_DIR/dist/index.js" "$LINK_DIR/dreamfactory"
chmod +x "$INSTALL_DIR/dist/index.js"

# 6. Run postinstall to create ~/.dreamfactory/.env
if [ -f "$INSTALL_DIR/scripts/postinstall.cjs" ]; then
  node "$INSTALL_DIR/scripts/postinstall.cjs"
fi

# 7. Check PATH
ensure_in_path "$LINK_DIR"

ok "DreamFactory $TAG installed successfully!"
echo ""
echo "  Run:  dreamfactory"
echo "  Init: dreamfactory init"
echo ""
