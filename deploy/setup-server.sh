#!/usr/bin/env bash
# One-time server setup: checks Docker and creates the project directory.
# Needs SSH access, Docker with the compose plugin on the server (see
# install-server-deps.sh), and sudo rights for the deploy user.
#
#   cp deploy/config.example.env deploy/config.env   # then edit it
#   bash deploy/setup-server.sh
source "$(dirname "$0")/lib.sh"

echo "==> Checking Docker on $DEPLOY_HOST"
remote 'sudo docker --version && sudo docker compose version'

echo "==> Creating $DEPLOY_PATH"
remote "sudo mkdir -p '$DEPLOY_PATH' && sudo chown '$DEPLOY_USER' '$DEPLOY_PATH'"

echo "Done. Now run: bash deploy/deploy.sh"
