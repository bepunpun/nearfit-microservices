#!/usr/bin/env bash
# Install what the server needs (Docker Engine with the compose plugin, rsync,
# curl, and optionally nginx and certbot). Run once, before deploy/setup-server.sh.
# Debian/Ubuntu servers only.
#
#   bash deploy/install-server-deps.sh
#   INSTALL_NGINX=1 INSTALL_CERTBOT=1 bash deploy/install-server-deps.sh
#   DRY_RUN=1 bash deploy/install-server-deps.sh
source "$(dirname "$0")/lib.sh"

INSTALL_NGINX="${INSTALL_NGINX:-0}"
INSTALL_CERTBOT="${INSTALL_CERTBOT:-0}"
REMOTE_SCRIPT="/tmp/nearfit-install-deps.sh"

echo "==> Copying installer to $DEPLOY_HOST"
run scp -P "$SSH_PORT" "$ROOT/deploy/remote/install-deps.sh" "$DEPLOY_HOST:$REMOTE_SCRIPT"

echo "==> Installing dependencies on $DEPLOY_HOST (sudo)"
remote "sudo env INSTALL_NGINX='$INSTALL_NGINX' INSTALL_CERTBOT='$INSTALL_CERTBOT' bash '$REMOTE_SCRIPT'; status=\$?; rm -f '$REMOTE_SCRIPT'; exit \$status"

echo "Done. Next: bash deploy/setup-server.sh"
