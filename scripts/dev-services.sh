#!/usr/bin/env bash
# Run the three services natively with auto-reload, one process each:
#   gateway :4100, gym-service :4101, review-service :4102
# Press Ctrl-C to stop them all. Start the frontend separately: npm run dev:frontend
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

set -m # job control: every background job gets its own process group, so we can stop npm and node together

pids=()
stop() {
  trap - INT TERM EXIT
  for pid in "${pids[@]}"; do kill -- "-$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap stop INT TERM EXIT

npm --prefix services/gym-service run dev &
pids+=($!)
npm --prefix services/review-service run dev &
pids+=($!)
npm --prefix services/gateway run dev &
pids+=($!)

# exits as soon as any service dies, and the trap then stops the rest
wait -n
