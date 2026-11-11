#!/usr/bin/env bash
# Auto-commit and push every change in this repo to origin (run by the Claude Code Stop hook in .claude/settings.json).
# Respects .gitignore, so .env, databases, venvs, node_modules and runtime state are never committed.
# Prints a one-line JSON systemMessage for the Claude Code UI; never fails the session.
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}" || exit 0
msg() { printf '{"systemMessage": "%s"}\n' "$1"; }

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { msg "autopush: not a git repo"; exit 0; }
git add -A >/dev/null 2>&1
# push to the tracked remote (e.g. a fork), falling back to origin
remote=$(git config "branch.$(git branch --show-current).remote" 2>/dev/null || echo origin)
if git diff --cached --quiet >/dev/null 2>&1; then
  # nothing new to commit; still push any earlier commits that did not reach origin
  if [ -n "$(git log --oneline @{u}..HEAD 2>/dev/null)" ]; then
    git push -q "$remote" HEAD >/dev/null 2>&1 && msg "autopush: pushed pending commits" || msg "autopush: push failed (will retry next turn)"
  fi
  exit 0
fi

n=$(git diff --cached --name-only | wc -l | tr -d ' ')
files=$(git diff --cached --name-only | head -5 | tr '\n' ' ' | sed 's/ $//')
[ "$n" -gt 5 ] && files="$files (+$((n - 5)) more)"
git commit -q -m "auto: update $n file(s): $files"  >/dev/null 2>&1 || { msg "autopush: commit failed"; exit 0; }
sha=$(git rev-parse --short HEAD)
if git push -q "$remote" HEAD >/dev/null 2>&1; then
  msg "autopush: committed and pushed $sha ($n file(s)) to origin"
else
  msg "autopush: committed $sha locally; push failed (will retry next turn)"
fi
exit 0
