#!/usr/bin/env bash
# Remove the public demo: empty its bucket, then delete the stack (bucket,
# CloudFront distribution, function, OAC and headers policy).
# The shared budget stack (public-demos-budget) is left alone.
#
#   scripts/teardown-demo.sh
set -euo pipefail

export AWS_REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-public-demo-cancer-registry}"

BUCKET="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text)"

echo "==> Empty s3://$BUCKET"
aws s3 rm "s3://$BUCKET" --recursive

echo "==> Delete stack $STACK_NAME (CloudFront takes a few minutes)"
aws cloudformation delete-stack --stack-name "$STACK_NAME"
aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME"
echo "Done."
