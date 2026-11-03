#!/usr/bin/env bash
# Scan files that are about to be published for things that must never leak:
# customer names (from a private blocklist), workspace hosts, UUIDs, Databricks
# tokens, real email addresses and internal npm mirror hosts.
#
# Usage: scripts/scan-public.sh <dir-or-file> <blocklist-file>
# Exits 0 when clean, 1 when anything matches (matches are printed).
# The blocklist stays outside the repo; its contents are never printed.
set -euo pipefail

target="${1:?usage: scan-public.sh <dir-or-file> <blocklist-file>}"
blocklist="${2:?usage: scan-public.sh <dir-or-file> <blocklist-file>}"
[ -e "$target" ] || { echo "scan: no such path: $target" >&2; exit 2; }
[ -r "$blocklist" ] || { echo "scan: cannot read blocklist" >&2; exit 2; }

fail=0
report() { echo "scan: $1"; fail=1; }

# Blocklist terms: case-insensitive whole words. Print file names only, so the
# private terms never end up in logs.
if grep -rIlwiFf "$blocklist" "$target" >/dev/null 2>&1; then
  report "blocklisted term found in:"
  grep -rIlwiFf "$blocklist" "$target" | sed 's/^/  /'
fi

check() { # <label> <extended regex>
  local hits
  hits=$(grep -rIoiE "$2" "$target" 2>/dev/null | sort -u || true)
  if [ -n "$hits" ]; then report "$1:"; echo "$hits" | sed 's/^/  /' | head -20; fi
}

check "workspace host" '[a-z0-9-]+\.cloud\.databricks\.com|[a-z0-9.-]*databricksapps\.com|[a-z0-9-]+\.azuredatabricks\.net|[a-z0-9-]+\.gcp\.databricks\.com'
check "internal npm mirror" 'npm-proxy\.[a-z0-9.-]+|artifactory[a-z0-9.-]*|registry\.npmjs\.org\.[a-z]+'
check "UUID" '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
check "Databricks token" 'dapi[0-9a-f]{32}'

# Email addresses other than reserved example domains.
emails=$(grep -rIohE '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}' "$target" 2>/dev/null \
  | grep -viE '@(example\.(org|com|net)|[a-z0-9-]+\.example)$' | sort -u || true)
if [ -n "$emails" ]; then report "email address:"; echo "$emails" | sed 's/^/  /' | head -20; fi

if [ "$fail" -eq 0 ]; then echo "scan: clean ($target)"; fi
exit "$fail"
