#!/bin/sh
set -e

corepack enable
corepack prepare pnpm@10.0.0 --activate
pnpm config set store-dir .pnpm-store
pnpm install --frozen-lockfile

pnpm --filter @event-qa/backend typecheck
pnpm -r test
pnpm -r build
