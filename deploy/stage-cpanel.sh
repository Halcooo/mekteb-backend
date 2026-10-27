#!/bin/bash
set -eu
# Git deployment stages a candidate; activation/migrations remain explicit.
source_root="$(pwd -P)"
stage_root="$HOME/mekteb-staging/backend"
test -f "$source_root/app.js"
test -f "$source_root/dist/cli/preflight.js"
test -f "$source_root/package-lock.json"
mkdir -p "$stage_root"
for item in dist migrations app.js package.json package-lock.json; do
  /usr/bin/rsync -a "$source_root/$item" "$stage_root/"
done
mkdir -p "$stage_root/deploy" "$stage_root/scripts"
for item in runtime.env.example CPANEL_DEPLOY.md PHONE_TEST.md run-push-cron.sh check-https.cjs; do
  /usr/bin/rsync -a "$source_root/deploy/$item" "$stage_root/deploy/"
done
/usr/bin/rsync -a "$source_root/scripts/push-keys.js" "$stage_root/scripts/"
printf '%s\n' 'Backend candidate staged. Follow deploy/CPANEL_DEPLOY.md before activation.'
