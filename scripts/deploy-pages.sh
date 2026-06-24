#!/usr/bin/env bash
# Publish the Congklak self-contained build to GitHub Pages (ARC-6).
#
# We serve Pages from the `gh-pages` branch (a single index.html) instead of a
# GitHub Actions build, because the host account currently has Actions disabled
# by a billing lock. This script is the one-command redeploy until that's fixed.
#
#   ./scripts/deploy-pages.sh
#
# Live URL: https://rizkyriyadi.github.io/arc-congklak/
set -euo pipefail

REPO_URL="${PAGES_REMOTE:-https://github.com/rizkyriyadi/arc-congklak.git}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building self-contained game"
npm run build:standalone

STAGE="$(mktemp -d)"
cp dist-standalone/congklak.html "$STAGE/index.html"
touch "$STAGE/.nojekyll"

echo "==> Publishing to gh-pages"
cd "$STAGE"
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name=FoundingEngineer -c user.email=eng@arc.example \
    commit -q -m "Publish Congklak self-contained build"
git remote add origin "$REPO_URL"
git push -q -f origin gh-pages
cd "$ROOT"
rm -rf "$STAGE"

echo "==> Done. Pages will rebuild in ~30s: https://rizkyriyadi.github.io/arc-congklak/"
