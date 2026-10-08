#!/usr/bin/env bash
# Full pre-commit gate. Runs every check, reports each one, and exits non-zero
# if ANY of them failed.
#
# Written because `npm test | grep Tests` makes the pipeline's exit status
# grep's, not the test runner's — so chaining it with `&&` silently pushes
# over a red suite. Every step here captures its own exit code.
set -uo pipefail

export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1

failed=0
run() {
  local name=$1; shift
  local log
  log=$(mktemp)
  if "$@" >"$log" 2>&1; then
    printf '  \033[32m✔\033[0m %-22s %s\n' "$name" "$(tail -1 "$log" | cut -c1-80)"
  else
    failed=1
    printf '  \033[31m✘\033[0m %-22s FAILED\n' "$name"
    sed 's/^/      /' "$log" | tail -25
  fi
  rm -f "$log"
}

run "yaml guard"     node scripts/lib/yamlguard.mjs
run "content valid"  node scripts/validate-content.mjs
run "content build"  npm run content:build
run "ruby fences"     node scripts/check-ruby-fences.mjs
run "typecheck"      npx tsc -b
run "lint"           npx eslint .
run "tests"          npx vitest run
run "build"          npm run build

if [ "$failed" -eq 0 ]; then
  printf '\n\033[32mgate passed\033[0m\n'
else
  printf '\n\033[31mgate FAILED — do not commit\033[0m\n'
fi
exit "$failed"
