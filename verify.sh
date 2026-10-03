#!/bin/bash
# Validate, test and type-check the plugin. Exits non-zero on the first failure.
set -euo pipefail
cd "$(dirname "$0")"

# Claude Code writes its API types into .claude-plugin/types/ once it has loaded the plugin.
# Before that, point CLAUDE_CODE_TYPES at a claude-code.d.ts (the plugin-authoring skill prints its path).
TYPES="${CLAUDE_CODE_TYPES:-.claude-plugin/types/claude-code/index.d.ts}"
if [ ! -f "$TYPES" ]; then
  echo "verify: no Claude Code types at $TYPES; load the plugin once or set CLAUDE_CODE_TYPES" >&2
  exit 1
fi

claude plugin validate . | tail -1
claude plugin test . 2>&1 | tail -3

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/tsconfig.json" <<JSON
{
  "compilerOptions": {
    "target": "es2023", "lib": ["es2023"], "types": [],
    "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noUncheckedIndexedAccess": true, "noEmit": true, "skipLibCheck": true,
    "jsx": "react", "jsxFactory": "h", "jsxFragmentFactory": "Fragment"
  },
  "include": ["$(cd "$(dirname "$TYPES")" && pwd)/$(basename "$TYPES")", "$PWD/hooks", "$PWD/types", "$PWD/tests"]
}
JSON
npx -y -p typescript tsc -p "$TMP/tsconfig.json"
echo "verify: ok"
