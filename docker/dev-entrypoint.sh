#!/bin/sh
set -eu

LOCK_HASH_FILE="node_modules/.deps-lock.sha256"

compute_deps_hash() {
  cat package.json package-lock.json | sha256sum | awk '{print $1}'
}

should_install=false

if [ ! -d "node_modules" ]; then
  should_install=true
elif [ ! -f "$LOCK_HASH_FILE" ]; then
  should_install=true
else
  current_hash="$(compute_deps_hash)"
  saved_hash="$(cat "$LOCK_HASH_FILE")"
  if [ "$current_hash" != "$saved_hash" ]; then
    should_install=true
  fi
fi

if [ "$should_install" = true ]; then
  echo "Dependencies changed or missing. Running npm ci..."
  npm ci
  mkdir -p node_modules
  compute_deps_hash > "$LOCK_HASH_FILE"
fi

exec npm run dev -- --legacy-watch
