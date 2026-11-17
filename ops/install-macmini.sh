#!/bin/bash
# Installs Tasteloop on a dedicated macOS machine (service user, LaunchDaemons).
# Starting point: a bare macOS (no Homebrew, Node, cloudflared, whisper or Obsidian needed).
#
# NEVER touched: FileVault, the admin user's automatic login, energy/restart settings,
# network interfaces, existing LaunchAgents or VMs. Our services only use WEB_PORT
# (default 3042) on 127.0.0.1.
#
# DRY RUN by default: the script only shows what it would do.
# Run for real with --apply. Run as an admin user (not root); single steps use sudo.
#
#   ops/install-macmini.sh --brand <brand-id> --vault /Users/branding/Vaults/<vault> [--apply]
#   ops/install-macmini.sh --brand <brand-id> --vault <path> --config <brand config> --apply --no-services   # first run
#
# The brand config lives with the service user in ~/.config/tasteloop/brands/<brand-id>.yaml
# (not in the repo: it contains chat IDs, names and paths). --config copies it there.
#   ops/install-macmini.sh --brand <brand-id> --render /tmp/plists     # only render the plists (tests)
#
# More settings via environment:
#   SERVICE_USER (branding)  REPO_BUNDLE (path to a git bundle)  WEB_PORT (3042)
#   CF_TEAM_DOMAIN  CF_AUD  CF_EMAILS  TUNNEL_ID  TUNNEL_HOSTNAME
#   WHISPER_MODEL (ggml-large-v3-turbo-q5_0.bin)  SYNC_EXCLUDES_FILE (output of sync-plan)
#
# This script never asks for secrets (bot token, API keys, tunnel credentials, Obsidian login)
# and never takes them as arguments. A person enters them interactively.
set -euo pipefail

SERVICE_USER="${SERVICE_USER:-branding}"
WEB_PORT="${WEB_PORT:-3042}"
WHISPER_MODEL="${WHISPER_MODEL:-ggml-large-v3-turbo-q5_0.bin}"
LABEL_PREFIX="eu.tasteloop"
BRAND_ID=""
VAULT=""
MODE="dry"
RENDER_DIR=""
CONFIG_SRC=""
START_SERVICES=1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --brand) BRAND_ID="$2"; shift 2 ;;
    --vault) VAULT="$2"; shift 2 ;;
    --config) CONFIG_SRC="$2"; shift 2 ;;
    --apply) MODE="apply"; shift ;;
    --no-services) START_SERVICES=0; shift ;;
    --render) MODE="render"; RENDER_DIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$BRAND_ID" ]] || { echo "--brand is missing" >&2; exit 2; }
[[ "$BRAND_ID" =~ ^[a-z0-9-]+$ ]] || { echo "--brand: only a-z, 0-9, -" >&2; exit 2; }

SERVICE_HOME="/Users/$SERVICE_USER"
REPO="$SERVICE_HOME/tasteloop"
VAULT="${VAULT:-$SERVICE_HOME/Vaults/vault}"
NODE_BIN="${NODE_BIN:-/opt/homebrew/opt/node@22/bin/node}"

run() {
  # runs (apply) or shows (dry)
  if [[ "$MODE" == "apply" ]]; then
    echo "+ $*"
    "$@"
  else
    echo "  would run: $*"
  fi
}

as_service() { run sudo -u "$SERVICE_USER" -H "$@"; }

step() { echo; echo "== $* =="; }

render_plists() {
  local out="$1"
  mkdir -p "$out"
  for tpl in "$SCRIPT_DIR"/launchd/*.plist.template; do
    local name
    name="$(basename "$tpl" .plist.template)"
    name="${name/$LABEL_PREFIX./$LABEL_PREFIX.$BRAND_ID.}"
    sed \
      -e "s#__USER__#$SERVICE_USER#g" \
      -e "s#__HOME__#$SERVICE_HOME#g" \
      -e "s#__REPO__#$REPO#g" \
      -e "s#__BRAND_ID__#$BRAND_ID#g" \
      -e "s#__NODE__#$NODE_BIN#g" \
      -e "s#__NODE_DIR__#$(dirname "$NODE_BIN")#g" \
      -e "s#__VAULT__#$VAULT#g" \
      -e "s#__WEB_PORT__#$WEB_PORT#g" \
      -e "s#__CF_TEAM_DOMAIN__#${CF_TEAM_DOMAIN:-}#g" \
      -e "s#__CF_AUD__#${CF_AUD:-}#g" \
      -e "s#__CF_EMAILS__#${CF_EMAILS:-}#g" \
      "$tpl" > "$out/$name.plist"
  done
  if grep -l "__[A-Z_]*__" "$out"/*.plist >/dev/null 2>&1; then
    echo "Placeholders left in:" >&2
    grep -l "__[A-Z_]*__" "$out"/*.plist >&2
    return 1
  fi
}

if [[ "$MODE" == "render" ]]; then
  render_plists "$RENDER_DIR"
  echo "Plists rendered to $RENDER_DIR"
  exit 0
fi

echo "Mode: $MODE (brand: $BRAND_ID, user: $SERVICE_USER, vault: $VAULT)"
[[ "$MODE" == "dry" ]] && echo "Dry run. Add --apply to run for real."

step "1. Check prerequisites"
[[ "$(uname)" == "Darwin" ]] || { echo "macOS only." >&2; exit 1; }
if [[ "$(id -u)" == "0" ]]; then echo "Please run as an admin user, not as root." >&2; exit 1; fi
# show only, change nothing (see header: FileVault and auto-login stay as they are)
echo "FileVault: $(fdesetup status 2>/dev/null | head -1 || echo unknown) (not changed)"
echo "Automatic login: $(defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null || echo off) (not changed)"
echo "Memory: $(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1073741824 )) GB, free on /: $(df -g / 2>/dev/null | awk 'NR==2{print $4}') GB"
if lsof -nP -iTCP:"$WEB_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $WEB_PORT is in use. Set WEB_PORT=<free port> (never 80 or 8123)." >&2
  [[ "$MODE" == "apply" ]] && exit 1
fi
[[ "$WEB_PORT" == "80" || "$WEB_PORT" == "8123" ]] && { echo "Port $WEB_PORT is reserved for other services." >&2; exit 1; }

step "2. Homebrew (bare macOS; the official installer brings the Xcode Command Line Tools)"
if command -v brew >/dev/null || [[ -x /opt/homebrew/bin/brew ]]; then
  echo "Homebrew: present"
else
  echo "  Homebrew is missing. Official installer, asks for the admin password:"
  # single quotes: nothing is downloaded in a dry run
  run /bin/bash -c '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
fi
BREW="$(command -v brew || echo /opt/homebrew/bin/brew)"

step "3. Packages (Homebrew, as admin)"
run "$BREW" install node@22 whisper-cpp ffmpeg cloudflared

step "4. Service user $SERVICE_USER (standard user, no admin, no automatic login)"
if id "$SERVICE_USER" >/dev/null 2>&1; then
  echo "User already exists."
else
  echo "The password is asked for interactively and stored nowhere."
  run sudo sysadminctl -addUser "$SERVICE_USER" -fullName "Branding Dienst" -shell /bin/zsh -home "$SERVICE_HOME" -password -
  run sudo createhomedir -c -u "$SERVICE_USER"
  # hide from the login window
  run sudo dscl . create "/Users/$SERVICE_USER" IsHidden 1
fi

step "5. Get the code (git clone or git bundle)"
if [[ -n "${REPO_BUNDLE:-}" ]]; then
  as_service git clone "$REPO_BUNDLE" "$REPO"
else
  echo "  REPO_BUNDLE not set. Either clone the public repo as $SERVICE_USER, or create a bundle"
  echo "  (git bundle create tasteloop.bundle --all), copy it here and set REPO_BUNDLE=/path/tasteloop.bundle."
fi
as_service bash -c "cd '$REPO' && PATH='$(dirname "$NODE_BIN")':\$PATH npm ci && PATH='$(dirname "$NODE_BIN")':\$PATH npm run build:web"

step "6. Whisper model (about 550 MB, needs about 1 GB of RAM while transcribing)"
as_service mkdir -p "$SERVICE_HOME/.local/share/whisper"
as_service curl -fL --retry 3 -o "$SERVICE_HOME/.local/share/whisper/$WHISPER_MODEL" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$WHISPER_MODEL"

step "7. Secrets file (outside repo and vault, chmod 600)"
as_service mkdir -p "$SERVICE_HOME/.config/tasteloop"
as_service install -m 600 "$REPO/.env.example" "$SERVICE_HOME/.config/tasteloop/.env"
echo "  Then fill it in by hand: sudo -u $SERVICE_USER -H nano $SERVICE_HOME/.config/tasteloop/.env"

step "7b. Brand config (outside the repo)"
BRAND_CFG="$SERVICE_HOME/.config/tasteloop/brands/$BRAND_ID.yaml"
as_service mkdir -p "$SERVICE_HOME/.config/tasteloop/brands"
if [[ -n "$CONFIG_SRC" ]]; then
  run sudo install -o "$SERVICE_USER" -m 600 "$CONFIG_SRC" "$BRAND_CFG"
else
  echo "  --config not set. Create a config from brands/example.yaml and copy it to $BRAND_CFG."
fi

step "8. Obsidian Headless Sync (no Obsidian app, only the brand folder)"
as_service mkdir -p "$SERVICE_HOME/.npm-global" "$(dirname "$VAULT")"
as_service bash -c "PATH='$(dirname "$NODE_BIN")':\$PATH npm install -g --prefix '$SERVICE_HOME/.npm-global' obsidian-headless"
echo "  Interactive (log in with your Obsidian account, connect the vault):"
echo "    sudo -u $SERVICE_USER -H $SERVICE_HOME/.npm-global/bin/ob login"
echo "    sudo -u $SERVICE_USER -H $SERVICE_HOME/.npm-global/bin/ob sync-list-remote"
echo "    sudo -u $SERVICE_USER -H $SERVICE_HOME/.npm-global/bin/ob sync-setup --vault \"<Vault-Name>\" --path \"$VAULT\" --device-name \"Tasteloop host\""
if [[ -n "${SYNC_EXCLUDES_FILE:-}" ]]; then
  echo "    sudo -u $SERVICE_USER -H $SERVICE_HOME/.npm-global/bin/ob sync-config --path \"$VAULT\" --excluded-folders \"$(paste -sd, "$SYNC_EXCLUDES_FILE")\" --configs '' --file-types image"
else
  echo "    BEFORE the first sync, set exclusions: create the list with 'npm run sync-plan' on a machine with the full vault (docs/always-on.md)"
  echo "    and run this script again with SYNC_EXCLUDES_FILE=<file>."
fi
echo "    sudo -u $SERVICE_USER -H $SERVICE_HOME/.npm-global/bin/ob sync --path \"$VAULT\"   # only then sync once"
echo "    Then run doctor: it reports every file outside vault.sync_only."

step "9. Cloudflare Tunnel (login and tunnel creation are interactive)"
as_service mkdir -p "$SERVICE_HOME/.cloudflared"
if [[ -n "${TUNNEL_ID:-}" && -n "${TUNNEL_HOSTNAME:-}" ]]; then
  if [[ "$MODE" == "apply" ]]; then
    sed -e "s#__TUNNEL_ID__#$TUNNEL_ID#g" -e "s#__HOME__#$SERVICE_HOME#g" -e "s#__HOSTNAME__#$TUNNEL_HOSTNAME#g" -e "s#__WEB_PORT__#$WEB_PORT#g" \
      "$SCRIPT_DIR/cloudflared/config.yml.template" | sudo -u "$SERVICE_USER" -H tee "$SERVICE_HOME/.cloudflared/config.yml" >/dev/null
  else
    echo "  would write ~/.cloudflared/config.yml from ops/cloudflared/config.yml.template"
  fi
else
  echo "  First, interactively: sudo -u $SERVICE_USER -H cloudflared tunnel login"
  echo "                       sudo -u $SERVICE_USER -H cloudflared tunnel create tasteloop"
  echo "                       sudo -u $SERVICE_USER -H cloudflared tunnel route dns tasteloop <hostname>"
  echo "  Then run this script again with TUNNEL_ID=<id> TUNNEL_HOSTNAME=<hostname>."
fi

step "10. Check and create the vault structure"
as_service bash -c "cd '$REPO' && '$NODE_BIN' --import tsx packages/core/src/cli.ts doctor --brand '$BRAND_CFG' || true"
as_service bash -c "cd '$REPO' && '$NODE_BIN' --import tsx packages/core/src/cli.ts init-vault --brand '$BRAND_CFG'"

step "11. launchd services (LaunchDaemons with UserName, run without a login)"
as_service mkdir -p "$SERVICE_HOME/Library/Logs/tasteloop"
if [[ "$START_SERVICES" == "0" ]]; then
  echo "  Skipped (--no-services). Set up secrets, ob login and the tunnel first, then run again without this option."
  echo
  echo "== Done (without services) =="
  exit 0
fi
TMP_PLISTS="$(mktemp -d)"
render_plists "$TMP_PLISTS"
for f in "$TMP_PLISTS"/*.plist; do
  name="$(basename "$f")"
  run sudo install -o root -g wheel -m 644 "$f" "/Library/LaunchDaemons/$name"
  run sudo launchctl bootout system "/Library/LaunchDaemons/$name" 2>/dev/null || true
  run sudo launchctl bootstrap system "/Library/LaunchDaemons/$name"
done
rm -rf "$TMP_PLISTS"

step "Done"
echo "Status:   sudo launchctl list | grep $LABEL_PREFIX"
echo "Logs:     sudo tail -f $SERVICE_HOME/Library/Logs/tasteloop/*.log"
echo "Restart:  sudo launchctl kickstart -k system/$LABEL_PREFIX.$BRAND_ID.bot"
