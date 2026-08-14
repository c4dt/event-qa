#!/bin/sh
set -e

# /data is normally a host bind mount. Docker auto-creates it owned by
# root if it doesn't already exist on the host, which would otherwise
# leave the non-root "app" user unable to write event-qa.db there.
mkdir -p /data
chown -R app:app /data

exec su-exec app node backend/dist/index.js "$@"
