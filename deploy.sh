#!/bin/bash
set -euo pipefail

HOST="ubuntu@63.180.21.221"
KEY="$HOME/.ssh/id_rsa"
REMOTE_DIR="/home/ubuntu/aipromo"

echo "==> Syncing files to EC2..."
rsync -avz --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude data \
  --exclude .env \
  --exclude .env.test \
  --exclude .env.cloudflare \
  -e "ssh -i $KEY -o StrictHostKeyChecking=no" \
  ./ "$HOST:$REMOTE_DIR/"

echo "==> Building and starting containers..."
ssh -i "$KEY" -o StrictHostKeyChecking=no "$HOST" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build"

echo "==> Done! Site: https://selected.highfunk.uk"
