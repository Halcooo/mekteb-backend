#!/bin/bash
set -eu
# Cron supplies an explicit Node binary and private env file. No shell sourcing:
# dotenv reads the file without interpreting passwords as shell commands.
: "${MEKTEB_NODE_BIN:?Set the absolute hosting Node.js binary}"
: "${MEKTEB_APP_ROOT:?Set the private backend application root}"
: "${MEKTEB_ENV_FILE:?Set the absolute private configuration file}"
cd "$MEKTEB_APP_ROOT"
export NODE_ENV=production
exec "$MEKTEB_NODE_BIN" dist/push-worker.js
