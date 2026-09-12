#!/bin/sh
set -e

# Requires: IMAGE, SHORT_SHA env vars, and an already-authenticated
# `docker login` for the target registry.

: "${IMAGE:?IMAGE env var is required}"
: "${SHORT_SHA:?SHORT_SHA env var is required}"

docker build --platform linux/amd64 -t "$IMAGE:latest" -t "$IMAGE:$SHORT_SHA" .
docker push "$IMAGE:latest"
docker push "$IMAGE:$SHORT_SHA"
