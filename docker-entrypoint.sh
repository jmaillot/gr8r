#!/bin/sh
# Starts as root only to make the data volume writable for the runtime user,
# then drops privileges. Set PUID/PGID to match the owner of a bind mount.
set -eu

PUID=${PUID:-1000}
PGID=${PGID:-$PUID}
DATA_DIR=${DATA_DIR:-/data}

case "$PUID" in
  '' | *[!0-9]*)
    echo "PUID must be a numeric uid (got '$PUID')" >&2
    exit 1
    ;;
esac
case "$PGID" in
  '' | *[!0-9]*)
    echo "PGID must be a numeric gid (got '$PGID')" >&2
    exit 1
    ;;
esac

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  # Also fixes databases and backups restored with root ownership.
  chown -R "$PUID:$PGID" "$DATA_DIR"
  exec su-exec "$PUID:$PGID" "$@"
fi

exec "$@"
