#!/usr/bin/env bash
# Build and publish the public, backend-less demo to S3 + CloudFront.
#
#   scripts/deploy-demo.sh
#
# Env (all optional): AWS_PROFILE, AWS_REGION (default us-east-1),
# STACK_NAME (default public-demo-cancer-registry), APP_NAME (cancer-registry),
# BLOCKLIST (default ~/.config/edip/blocklist.txt; the scan is skipped only if
# you set SKIP_BLOCKLIST=1 and no file exists).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLIENT="$ROOT/app/client"
DIST="$CLIENT/dist-demo"
export AWS_REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-public-demo-cancer-registry}"
APP_NAME="${APP_NAME:-cancer-registry}"
BLOCKLIST="${BLOCKLIST:-$HOME/.config/edip/blocklist.txt}"

echo "==> Build (npm run build:demo)"
(cd "$CLIENT" && npm run build:demo)

echo "==> Scan the bundle before publishing"
if [ -r "$BLOCKLIST" ]; then
  "$ROOT/scripts/scan-public.sh" "$DIST" "$BLOCKLIST"
elif [ "${SKIP_BLOCKLIST:-}" = "1" ]; then
  empty="$(mktemp)"; echo "zz-no-blocklist-zz" > "$empty"
  "$ROOT/scripts/scan-public.sh" "$DIST" "$empty"; rm -f "$empty"
else
  echo "No blocklist at $BLOCKLIST (set BLOCKLIST, or SKIP_BLOCKLIST=1)" >&2; exit 1
fi

echo "==> CSP hash of the inline script"
CSP_HASH="$(node -e '
  const fs = require("fs");
  const crypto = require("crypto");
  const html = fs.readFileSync(process.argv[1], "utf8");
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (inline.length !== 1) { console.error("expected exactly 1 inline script, found " + inline.length); process.exit(1); }
  console.log("sha256-" + crypto.createHash("sha256").update(inline[0], "utf8").digest("base64"));
' "$DIST/index.html")"
echo "    $CSP_HASH"

echo "==> Deploy stack $STACK_NAME"
aws cloudformation deploy \
  --stack-name "$STACK_NAME" \
  --template-file "$ROOT/infra/static-demo.yaml" \
  --parameter-overrides "AppName=$APP_NAME" "CspScriptHash=$CSP_HASH" \
  --tags project=public-demos "app=$APP_NAME" \
  --no-fail-on-empty-changeset

out() {
  aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
BUCKET="$(out BucketName)"
DIST_ID="$(out DistributionId)"
URL="$(out Url)"

echo "==> Upload to s3://$BUCKET"
# Hashed assets first (cache forever), then the rest (always revalidate), then
# prune old assets once the new index.html is live.
aws s3 sync "$DIST/assets" "s3://$BUCKET/assets" \
  --cache-control "public,max-age=31536000,immutable"
aws s3 sync "$DIST" "s3://$BUCKET" --exclude "assets/*" \
  --cache-control "no-cache" --delete
aws s3 sync "$DIST/assets" "s3://$BUCKET/assets" \
  --cache-control "public,max-age=31536000,immutable" --delete

echo "==> Invalidate /index.html"
# Client routes are rewritten to /index.html before the cache lookup, so this
# one path covers every route.
INV_ID="$(aws cloudfront create-invalidation --distribution-id "$DIST_ID" \
  --paths /index.html --query Invalidation.Id --output text)"
aws cloudfront wait invalidation-completed --distribution-id "$DIST_ID" --id "$INV_ID"

echo "==> Waiting for the distribution to be Deployed"
aws cloudfront wait distribution-deployed --id "$DIST_ID"

echo "Live: $URL"
