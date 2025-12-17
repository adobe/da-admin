#!/bin/bash

# Copyright 2025 Adobe. All rights reserved.
# This file is licensed to you under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License. You may obtain a copy
# of the License at http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software distributed under
# the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
# OF ANY KIND, either express or implied. See the License for the specific language
# governing permissions and limitations under the License.

set -e

ENVIRONMENT="ci"

# Prepare version and capture version
echo "Preparing version for environment: $ENVIRONMENT"
VERSION=$(node prepare-deploy.js)

if [ -z "$VERSION" ]; then
  echo "Error: Failed to get version from prepare-deploy.js"
  exit 1
fi

# Get current git branch name
BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ -z "$BRANCH" ]; then
  echo "Error: Failed to get git branch name"
  exit 1
fi

echo "Creating version: $VERSION from branch: $BRANCH"

# Deploy with branch tag and version message and capture output
# wrangler deploy -e "$ENVIRONMENT" -c wrangler-versioned.toml --message "v$VERSION" --tag "$BRANCH"
OUTPUT=$(wrangler versions upload -e "$ENVIRONMENT" -c wrangler-versioned.toml --message "$ENVIRONMENT: v$VERSION - branch: $BRANCH" --tag "$BRANCH" 2>&1)

# Display the output
echo "$OUTPUT"

# Parse the deployment information
WORKER_VERSION_ID=$(echo "$OUTPUT" | grep "Worker Version ID:" | sed 's/.*Worker Version ID: //')
VERSION_PREVIEW_URL=$(echo "$OUTPUT" | grep "Version Preview URL:" | sed 's/.*Version Preview URL: //')

# Write to a file that can be sourced (for local use)
cat > .deployment-env << EOF
export WORKER_VERSION_ID="$WORKER_VERSION_ID"
export VERSION_PREVIEW_URL="$VERSION_PREVIEW_URL"
export VERSION_PREVIEW_BRANCH="$BRANCH"
EOF

# If running in GitHub Actions, also write to GITHUB_ENV
if [ -n "$GITHUB_ENV" ]; then
  echo "WORKER_VERSION_ID=$WORKER_VERSION_ID" >> "$GITHUB_ENV"
  echo "VERSION_PREVIEW_URL=$VERSION_PREVIEW_URL" >> "$GITHUB_ENV"
  echo "VERSION_PREVIEW_BRANCH=$BRANCH" >> "$GITHUB_ENV"
  echo "Variables exported to GitHub Actions environment"
fi

# Deploy the version
wrangler versions deploy -y -e ci --version-id "$WORKER_VERSION_ID"

echo ""
echo "Version deployment complete!"
echo "----------------------------------------"
echo "Deployment information: (copy inside a .deployment-env file to run locally)"
echo "export WORKER_VERSION_ID=$WORKER_VERSION_ID"
echo "export VERSION_PREVIEW_URL=$VERSION_PREVIEW_URL"
echo "export VERSION_PREVIEW_BRANCH=$BRANCH"
echo "----------------------------------------"

