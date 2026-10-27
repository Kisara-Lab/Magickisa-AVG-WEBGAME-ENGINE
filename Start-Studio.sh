#!/bin/sh
set -eu
cd -- "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo 'Please install Node.js 22 or newer: https://nodejs.org/' >&2
  exit 1
fi
exec node scripts/launch-studio.mjs "$@"
