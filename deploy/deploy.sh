#!/usr/bin/env bash
# Copy the project to the server over SSH and (re)build and start the containers.
# The images are built on the server, so nothing but source is uploaded.
#
#   bash deploy/deploy.sh                 # test, copy, rebuild, restart
#   SKIP_TESTS=1 bash deploy/deploy.sh    # skip the test run
#   DRY_RUN=1 bash deploy/deploy.sh       # print what would happen
source "$(dirname "$0")/lib.sh"
cd "$ROOT"

if [ "${SKIP_TESTS:-0}" != "1" ]; then
  echo "==> Running tests"
  run npm run ci:all
  run npm test
fi

echo "==> Copying the project to $DEPLOY_HOST:$DEPLOY_PATH"
# Reviews live in a Docker volume on the server, outside this tree, so --delete cannot touch them.
run rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
  --exclude .git --exclude node_modules --exclude dist --exclude .angular \
  --exclude docs --exclude 'deploy/config.env' --exclude 'services/review-service/src/data/reviews.json' \
  ./ "$DEPLOY_HOST:$DEPLOY_PATH/"

echo "==> Building images and restarting containers (this can take a few minutes)"
remote "cd '$DEPLOY_PATH' && sudo env WEB_PORT='$WEB_PORT' docker compose up -d --build --remove-orphans && sudo docker image prune -f"

echo "==> Health check"
if [ "${DRY_RUN:-0}" = "1" ]; then
  remote "curl -fsS http://localhost:$WEB_PORT/api/health"
else
  for _ in $(seq 1 15); do
    sleep 4
    if ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" "curl -fsS http://localhost:$WEB_PORT/api/health" >/dev/null 2>&1; then
      echo "NearFit is up on $DEPLOY_HOST:$WEB_PORT"
      exit 0
    fi
  done
  echo "Health check failed. Look at the logs: ssh $DEPLOY_HOST 'cd $DEPLOY_PATH && sudo docker compose logs --tail 50'" >&2
  exit 1
fi
