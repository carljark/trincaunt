---
name: verify
description: Run the full verification pass (api tests, api build, client tests, client lint, client build) and report what fails. Use whenever a change is finished, before the user commits, or when they ask whether things still work, since this repo has no local CI gate. Trigger on "verify", "check everything", "run all checks", "does it still pass", even if they don't name the individual commands.
---

The repo has no single check command, so run each step yourself. Keep going when one fails: the user wants the whole picture in one pass, not the first error.

Always use single-run mode. `npm test` is vitest in watch mode and would hang.

1. `cd api && npx vitest run`
2. `cd api && npm run build`
3. `cd client && npx vitest run`
4. `cd client && npm run lint`
5. `cd client && npm run build`

## Expected state
Everything is expected to pass: all tests, lint (`--max-warnings 0`) and both builds. Any failure is new, so tie it to the files in `git diff --stat` and, if unsure, confirm against HEAD with `git stash` before blaming the current changes.

## Report
Give one pass/fail line per step. For each unexpected failure, show the relevant error and say whether it touches files in `git diff --stat`. If everything passes, say so in one sentence.

Do not fix anything unless asked; the user may want to decide how.
