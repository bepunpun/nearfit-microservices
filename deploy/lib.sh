# Shared by setup-server.sh and deploy.sh (sourced, not run directly).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${DEPLOY_CONFIG:-$ROOT/deploy/config.env}"

if [ -f "$CONFIG" ]; then
  # shellcheck disable=SC1090
  source "$CONFIG"
else
  echo "No config found at $CONFIG. Copy deploy/config.example.env to deploy/config.env and edit it." >&2
  exit 1
fi

: "${DEPLOY_HOST:?set DEPLOY_HOST (user@host) in $CONFIG}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/nearfit}"
SSH_PORT="${SSH_PORT:-22}"
WEB_PORT="${WEB_PORT:-8080}"
DEPLOY_USER="${DEPLOY_HOST%@*}"
[ "$DEPLOY_USER" = "$DEPLOY_HOST" ] && DEPLOY_USER="$(whoami)"

SSH_OPTS=(-p "$SSH_PORT")

# DRY_RUN=1 prints the commands instead of running them.
run() {
  if [ "${DRY_RUN:-0}" = "1" ]; then
    printf '+'; printf ' %q' "$@"; printf '\n'
  else
    "$@"
  fi
}
# -t gives sudo a terminal, so a password prompt works if passwordless sudo isn't set up
remote() { run ssh -t "${SSH_OPTS[@]}" "$DEPLOY_HOST" "$@"; }
