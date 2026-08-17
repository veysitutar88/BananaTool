# AGENTS.md — BananaTool

## Operating rules

1. Read `.ai-factory/DESCRIPTION.md` and `.ai-factory/PLAN.md` before making a change.
2. Treat `main` as protected. Work on the active pilot branch and use a reviewable pull request before any merge.
3. Do not trigger paid Gemini calls, write to production Supabase data, rotate credentials, or deploy without explicit owner approval.
4. Never put Gemini keys, Supabase service keys, personal images, or generated private media in Git, logs, test fixtures, or screenshots.
5. Keep model IDs and their documented capabilities in one registry. Do not use silent model fallback.
6. Preserve the existing Character DNA and Scene DNA user workflow unless the task explicitly changes it.
7. For every implementation change, run the relevant tests plus `npm run lint` and `npm run build`.
8. Prefer small modules with clear boundaries: UI state, model access, storage, validation, and PNG metadata must remain independently testable.
9. Use the installed AIF workflow in order: analyze/context → plan → implement → test → review. Do not reinstall globally available skills.
10. Record new risks, limitations, and deferred migration work in the pilot documentation rather than hiding them in code comments.

## Current pilot scope

See `.ai-factory/PLAN.md`. The first phase establishes documentation and a reliable baseline; it does not alter the user-facing workflow.