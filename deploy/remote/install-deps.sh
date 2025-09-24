#!/usr/bin/env bash
# Runs ON THE SERVER as root (deploy/install-server-deps.sh copies it there and
# calls it with sudo). Idempotent: safe to run again.
#
# Environment:
#   INSTALL_NGINX    1 = also install nginx
#   INSTALL_CERTBOT  1 = also install certbot (with the nginx plugin)
set -euo pipefail

INSTALL_NGINX="${INSTALL_NGINX:-0}"
INSTALL_CERTBOT="${INSTALL_CERTBOT:-0}"

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This script supports Debian/Ubuntu (apt) only. Install Docker Engine with the compose plugin, rsync and curl by hand." >&2
  exit 1
fi
export DEBIAN_FRONTEND=noninteractive

echo "==> Base packages (curl, rsync, gnupg, ca-certificates)"
apt-get update -y
apt-get install -y curl rsync gnupg ca-certificates

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "==> $(docker --version) with compose already installed, skipping"
else
  # shellcheck disable=SC1091
  . /etc/os-release
  case "$ID" in
    ubuntu|debian) ;;
    *) echo "Docker's apt repository setup here supports Ubuntu and Debian, not '$ID'. Install Docker by hand." >&2; exit 1 ;;
  esac
  echo "==> Docker Engine and the compose plugin from Docker's apt repository"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

if [ "$INSTALL_NGINX" = "1" ]; then
  echo "==> nginx"
  apt-get install -y nginx
  systemctl enable --now nginx
fi

if [ "$INSTALL_CERTBOT" = "1" ]; then
  echo "==> certbot"
  apt-get install -y certbot python3-certbot-nginx
fi

echo
echo "Installed:"
echo "  $(docker --version)"
echo "  $(docker compose version)"
echo "  rsync   $(rsync --version | head -n1)"
[ "$INSTALL_NGINX" = "1" ] && echo "  nginx   $(nginx -v 2>&1)"
[ "$INSTALL_CERTBOT" = "1" ] && echo "  certbot $(certbot --version 2>&1)"
exit 0
