#!/bin/sh
set -e
mkdir -p /data
chown bun:bun /data
exec su-exec bun "$@"
