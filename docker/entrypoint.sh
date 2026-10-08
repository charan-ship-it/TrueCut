#!/bin/sh
# truecut web | worker | migrate | <any command>
# `exec` hands signals straight to Node so deploys can stop a service gracefully.
set -e
case "$1" in
  web)
    export TRUECUT_QUEUE="${TRUECUT_QUEUE:-pgboss}"
    cd /app/apps/web
    exec node /app/node_modules/next/dist/bin/next start -H 0.0.0.0 -p "${PORT:-3100}" ;;
  worker)
    export TRUECUT_QUEUE=pgboss
    cd /app/apps/worker
    exec node /app/node_modules/tsx/dist/cli.mjs src/main.ts ;;
  migrate)
    cd /app/packages/db
    exec node /app/node_modules/tsx/dist/cli.mjs src/migrate.ts ;;
  *)
    exec "$@" ;;
esac
