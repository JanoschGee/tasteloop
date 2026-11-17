#!/bin/bash
# Installation auf dem Mac mini (dedizierter Rechner, Dienst-Benutzer, LaunchDaemons).
# Ausgangslage: nacktes macOS (ohne Homebrew, Node, cloudflared, whisper, Obsidian).
#
# NICHT angefasst werden: FileVault, die automatische Anmeldung des Admin-Benutzers,
# Energie-/Neustart-Einstellungen, Netzwerkschnittstellen, vorhandene LaunchAgents/VMs.
# Unsere Dienste nutzen keine Ports außer WEB_PORT (Standard 3042) auf 127.0.0.1.
#
# Standard ist ein TROCKENLAUF: das Skript zeigt nur, was es tun würde.
# Wirklich ausführen mit --apply. Läuft als Admin-Benutzer (nicht als root),
# einzelne Schritte nutzen sudo.
#
#   ops/install-macmini.sh --brand <marken-id> --vault /Users/branding/Vaults/<vault> [--apply]
#   ops/install-macmini.sh --brand <marken-id> --vault <pfad> --config <brands/datei.yaml> --apply --ohne-dienste   # erster Lauf
#
# Die Marken-Config liegt beim Dienst-Benutzer unter ~/.config/tasteloop/brands/<marken-id>.yaml
# (nicht im Repo, sie enthält Chat-IDs, Namen und Pfade). --config kopiert sie dorthin.
#   ops/install-macmini.sh --brand <marken-id> --render /tmp/plists     # nur Plists rendern (Test)
#
# Weitere Einstellungen per Umgebung:
#   SERVICE_USER (branding)  REPO_BUNDLE (Pfad zum git bundle)  WEB_PORT (3042)
#   CF_TEAM_DOMAIN  CF_AUD  CF_EMAILS  TUNNEL_ID  TUNNEL_HOSTNAME
#   WHISPER_MODEL (ggml-large-v3-turbo-q5_0.bin)  SYNC_EXCLUDES_FILE (Ausgabe von sync-plan)
#
# Secrets (Bot-Token, API-Keys, Tunnel-Credentials, Obsidian-Login) gibt dieses Skript
# nie ein und nimmt sie nie als Argument. Sie werden interaktiv vom Menschen gesetzt.
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
    --ohne-dienste) START_SERVICES=0; shift ;;
    --render) MODE="render"; RENDER_DIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$BRAND_ID" ]] || { echo "--brand fehlt" >&2; exit 2; }
[[ "$BRAND_ID" =~ ^[a-z0-9-]+$ ]] || { echo "--brand: nur a-z, 0-9, -" >&2; exit 2; }

SERVICE_HOME="/Users/$SERVICE_USER"
REPO="$SERVICE_HOME/tasteloop"
VAULT="${VAULT:-$SERVICE_HOME/Vaults/vault}"
NODE_BIN="${NODE_BIN:-/opt/homebrew/opt/node@22/bin/node}"

run() {
  # führt aus (apply) oder zeigt an (dry)
  if [[ "$MODE" == "apply" ]]; then
    echo "+ $*"
    "$@"
  else
    echo "  würde ausführen: $*"
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
    echo "Platzhalter nicht ersetzt in:" >&2
    grep -l "__[A-Z_]*__" "$out"/*.plist >&2
    return 1
  fi
}

if [[ "$MODE" == "render" ]]; then
  render_plists "$RENDER_DIR"
  echo "Plists gerendert nach $RENDER_DIR"
  exit 0
fi

echo "Modus: $MODE (Marke: $BRAND_ID, Benutzer: $SERVICE_USER, Vault: $VAULT)"
[[ "$MODE" == "dry" ]] && echo "Trockenlauf. Mit --apply wirklich ausführen."

step "1. Voraussetzungen prüfen"
[[ "$(uname)" == "Darwin" ]] || { echo "Nur macOS." >&2; exit 1; }
if [[ "$(id -u)" == "0" ]]; then echo "Bitte als Admin-Benutzer starten, nicht als root." >&2; exit 1; fi
# Nur anzeigen, nichts ändern (siehe Kopf: FileVault und Auto-Login bleiben, wie sie sind)
echo "FileVault: $(fdesetup status 2>/dev/null | head -1 || echo unbekannt) (wird nicht verändert)"
echo "Automatische Anmeldung: $(defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null || echo aus) (wird nicht verändert)"
echo "Speicher: $(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1073741824 )) GB, frei auf /: $(df -g / 2>/dev/null | awk 'NR==2{print $4}') GB"
if lsof -nP -iTCP:"$WEB_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $WEB_PORT ist belegt. Bitte WEB_PORT=<frei> setzen (nie 80 oder 8123)." >&2
  [[ "$MODE" == "apply" ]] && exit 1
fi
[[ "$WEB_PORT" == "80" || "$WEB_PORT" == "8123" ]] && { echo "Port $WEB_PORT ist für andere Dienste reserviert." >&2; exit 1; }

step "2. Homebrew (nacktes macOS; der offizielle Installer bringt die Xcode Command Line Tools mit)"
if command -v brew >/dev/null || [[ -x /opt/homebrew/bin/brew ]]; then
  echo "Homebrew: vorhanden"
else
  echo "  Homebrew fehlt. Offizieller Installer, fragt nach dem Admin-Passwort:"
  # Einfache Anführungszeichen: im Trockenlauf wird nichts heruntergeladen
  run /bin/bash -c '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
fi
BREW="$(command -v brew || echo /opt/homebrew/bin/brew)"

step "3. Pakete (Homebrew, als Admin)"
run "$BREW" install node@22 whisper-cpp ffmpeg cloudflared

step "4. Dienstbenutzer $SERVICE_USER (Standardbenutzer, kein Admin, keine automatische Anmeldung)"
if id "$SERVICE_USER" >/dev/null 2>&1; then
  echo "Benutzer existiert bereits."
else
  echo "Passwort wird interaktiv abgefragt und nirgends gespeichert."
  run sudo sysadminctl -addUser "$SERVICE_USER" -fullName "Branding Dienst" -shell /bin/zsh -home "$SERVICE_HOME" -password -
  run sudo createhomedir -c -u "$SERVICE_USER"
  # nicht im Anmeldefenster zeigen
  run sudo dscl . create "/Users/$SERVICE_USER" IsHidden 1
fi

step "5. Repo übernehmen (git clone oder git bundle)"
if [[ -n "${REPO_BUNDLE:-}" ]]; then
  as_service git clone "$REPO_BUNDLE" "$REPO"
else
  echo "  REPO_BUNDLE nicht gesetzt. Auf dem Entwicklungsrechner: git bundle create tasteloop.bundle --all"
  echo "  Datei auf den Mac mini kopieren und REPO_BUNDLE=/pfad/tasteloop.bundle setzen."
fi
as_service bash -c "cd '$REPO' && PATH='$(dirname "$NODE_BIN")':\$PATH npm ci && PATH='$(dirname "$NODE_BIN")':\$PATH npm run build:web"

step "6. Whisper-Modell (ca. 550 MB, braucht beim Transkribieren ca. 1 GB RAM)"
as_service mkdir -p "$SERVICE_HOME/.local/share/whisper"
as_service curl -fL --retry 3 -o "$SERVICE_HOME/.local/share/whisper/$WHISPER_MODEL" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$WHISPER_MODEL"

step "7. Secrets-Datei (außerhalb von Repo und Vault, chmod 600)"
as_service mkdir -p "$SERVICE_HOME/.config/tasteloop"
as_service install -m 600 "$REPO/.env.example" "$SERVICE_HOME/.config/tasteloop/.env"
echo "  Danach von Hand eintragen: sudo -u $SERVICE_USER -H nano $SERVICE_HOME/.config/tasteloop/.env"

step "7b. Marken-Config (außerhalb des Repos)"
BRAND_CFG="$SERVICE_HOME/.config/tasteloop/brands/$BRAND_ID.yaml"
as_service mkdir -p "$SERVICE_HOME/.config/tasteloop/brands"
if [[ -n "$CONFIG_SRC" ]]; then
  run sudo install -o "$SERVICE_USER" -m 600 "$CONFIG_SRC" "$BRAND_CFG"
else
  echo "  --config nicht gesetzt. Config von brands/example.yaml ableiten und nach $BRAND_CFG kopieren."
fi

step "8. Obsidian Headless Sync (ohne Obsidian-App, nur der Marken-Ordner)"
as_service mkdir -p "$SERVICE_HOME/.npm-global" "$(dirname "$VAULT")"
as_service bash -c "PATH='$(dirname "$NODE_BIN")':\$PATH npm install -g --prefix '$SERVICE_HOME/.npm-global' obsidian-headless"
echo "  Interaktiv (Login mit Obsidian-Konto, Vault verbinden):"
echo "    sudo -u $SERVICE_USER -H $SERVICE_HOME/.npm-global/bin/ob login"
echo "    sudo -u $SERVICE_USER -H $SERVICE_HOME/.npm-global/bin/ob sync-list-remote"
echo "    sudo -u $SERVICE_USER -H $SERVICE_HOME/.npm-global/bin/ob sync-setup --vault \"<Vault-Name>\" --path \"$VAULT\" --device-name \"Mac mini Branding\""
if [[ -n "${SYNC_EXCLUDES_FILE:-}" ]]; then
  echo "    sudo -u $SERVICE_USER -H $SERVICE_HOME/.npm-global/bin/ob sync-config --path \"$VAULT\" --excluded-folders \"$(paste -sd, "$SYNC_EXCLUDES_FILE")\" --configs '' --file-types image"
else
  echo "    VOR dem ersten Sync Ausschlüsse setzen: Liste mit 'sync-plan' auf dem Rechner mit dem vollstÃ¤ndigen Vault erzeugen (docs/always-on.md)"
  echo "    und dieses Skript mit SYNC_EXCLUDES_FILE=<datei> erneut starten."
fi
echo "    sudo -u $SERVICE_USER -H $SERVICE_HOME/.npm-global/bin/ob sync --path \"$VAULT\"   # erst danach einmal synchronisieren"
echo "    Danach doctor: meldet jede Datei außerhalb von vault.sync_nur."

step "9. Cloudflare Tunnel (Login und Tunnel-Anlage interaktiv)"
as_service mkdir -p "$SERVICE_HOME/.cloudflared"
if [[ -n "${TUNNEL_ID:-}" && -n "${TUNNEL_HOSTNAME:-}" ]]; then
  if [[ "$MODE" == "apply" ]]; then
    sed -e "s#__TUNNEL_ID__#$TUNNEL_ID#g" -e "s#__HOME__#$SERVICE_HOME#g" -e "s#__HOSTNAME__#$TUNNEL_HOSTNAME#g" -e "s#__WEB_PORT__#$WEB_PORT#g" \
      "$SCRIPT_DIR/cloudflared/config.yml.template" | sudo -u "$SERVICE_USER" -H tee "$SERVICE_HOME/.cloudflared/config.yml" >/dev/null
  else
    echo "  würde ~/.cloudflared/config.yml aus ops/cloudflared/config.yml.template schreiben"
  fi
else
  echo "  Erst interaktiv: sudo -u $SERVICE_USER -H cloudflared tunnel login"
  echo "                   sudo -u $SERVICE_USER -H cloudflared tunnel create tasteloop"
  echo "                   sudo -u $SERVICE_USER -H cloudflared tunnel route dns tasteloop <hostname>"
  echo "  Dann Skript mit TUNNEL_ID=<id> TUNNEL_HOSTNAME=<hostname> erneut starten."
fi

step "10. Vault-Struktur prüfen und anlegen"
as_service bash -c "cd '$REPO' && '$NODE_BIN' --import tsx packages/core/src/cli.ts doctor --brand '$BRAND_CFG' || true"
as_service bash -c "cd '$REPO' && '$NODE_BIN' --import tsx packages/core/src/cli.ts init-vault --brand '$BRAND_CFG'"

step "11. launchd-Dienste (LaunchDaemons mit UserName, laufen ohne Anmeldung)"
as_service mkdir -p "$SERVICE_HOME/Library/Logs/tasteloop"
if [[ "$START_SERVICES" == "0" ]]; then
  echo "  Übersprungen (--ohne-dienste). Erst Secrets, ob login und Tunnel einrichten, dann ohne diese Option erneut starten."
  echo
  echo "== Ende (ohne Dienste) =="
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

step "Fertig"
echo "Status:   sudo launchctl list | grep $LABEL_PREFIX"
echo "Logs:     sudo tail -f $SERVICE_HOME/Library/Logs/tasteloop/*.log"
echo "Neustart: sudo launchctl kickstart -k system/$LABEL_PREFIX.$BRAND_ID.bot"
