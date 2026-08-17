# AIF Pilot — BananaTool Modernization

**Status:** proposed and initialized  
**Testing:** required  
**Logging:** retain the existing scoped logger; add structured, safe diagnostics at every new server, model-routing, and persistence boundary. Never log keys, full images, raw DNA, or personal data.

## Goal

Modernize BananaTool’s Gemini generation foundation and establish an engineering baseline that is safe to evolve. The pilot validates the full AIF workflow: repository analysis, living documentation, implementation planning, test setup, targeted refactoring, quality verification, and review.

## Why this is the chosen pilot

BananaTool has meaningful product behavior, real external dependencies, recent source changes, and clear modernization pressure. It is therefore suitable for an end-to-end AIF trial; the work is neither a cosmetic interface pass nor a rewrite.

## Verified starting facts

- The app is React + TypeScript + Vite with optional Supabase persistence.
- The core product behavior is concentrated in `src/App.tsx`.
- No automated test suite or CI workflow is present.
- `@google/generative-ai` is a legacy SDK.
- The registry exposes preview Gemini image IDs and deprecated Imagen routes.
- Gemini calls originate in client-side Vite code and the sample Supabase configuration grants anonymous access.

## Scope

### Included

- Truthful project, architecture, security, and operational documentation.
- Reproducible baseline for install, lint, type-check, build, and tests.
- Migration design and implementation from the legacy Google SDK to `@google/genai`.
- Replacement of retired preview image identifiers with current stable Gemini image routes after capability verification.
- Removal or quarantine of retired Imagen routes.
- A server-side boundary for Gemini credentials and request validation.
- Modular extraction of generation-related orchestration from the monolithic app where it improves testability.
- Tests for model routing, validation, PNG metadata, and the highest-risk generation flow.
- A final technical review and a concise continuation roadmap.

### Excluded unless separately approved

- Paid live generation tests.
- Production deployment.
- Destructive or bulk changes to Supabase.
- A full redesign, a rewrite of the UI, or a change to the Character DNA / Scene DNA product concept.
- User authentication UX beyond the minimum needed to secure data access.

## Definition of Done

1. The product can be understood and run from repository documentation without relying on chat history.
2. Lint, type-check/build, and a focused automated test suite pass locally.
3. All active model choices are current, explicit, and documented; retired routes cannot be selected for new generation.
4. Browser code no longer embeds a long-lived Gemini API key.
5. The Supabase access model is documented, and any production data migration is separated behind explicit owner approval.
6. Generation, storage, and UI state have clear module boundaries for future work.
7. The pull request contains an AIF review covering correctness, security, tests, and deferred work.

## Work plan

### Phase 0 — Project context and guardrails
- [x] Add `.ai-factory/DESCRIPTION.md`.
- [x] Add `AGENTS.md`.
- [x] Add this plan.
- [ ] Replace the template README with product and setup documentation.
- [ ] Document the architecture, data flow, environment variables, local limitations, and operational risks.

### Phase 1 — Reproducible baseline
- [ ] Create a clean local checkout and record dependency installation, lint, type-check, and production-build results.
- [ ] Add a test runner suitable for the existing Vite/TypeScript application.
- [ ] Add CI for lint, type-check/build, and tests.
- [ ] Record all failures as issues in the pilot roadmap before changing behavior.

**Logging requirements:** log only stage names, model route, safe error classification, retry state, and duration. Redact keys, prompts containing personal data, images, and DNA payloads.

### Phase 2 — Model and SDK modernization
- [ ] Replace the legacy `@google/generative-ai` client with the GA `@google/genai` SDK.
- [ ] Audit every text and image model ID against current provider documentation.
- [ ] Replace retired preview IDs with verified stable routes; keep historical display mappings separate from selectable routes.
- [ ] Remove retired Imagen generation from new requests, with a clear migration message for any historical records.
- [ ] Add explicit capability metadata and validation so reference limits, aspect ratio, output size, and model availability are checked before requests.

**Logging requirements:** log selected model ID, declared capability version, non-sensitive request dimensions, response class, and safe provider failure code. Never log API credentials or full media payloads.

### Phase 3 — Secure execution boundary
- [ ] Move Gemini requests behind a minimal server-side API boundary appropriate for the chosen hosting model.
- [ ] Validate request shape, reference count, allowed model IDs, and file metadata at that boundary.
- [ ] Move the API key to server-only configuration and document key rotation.
- [ ] Design Supabase RLS and Storage policies for owner-scoped data; do not apply a production migration without owner approval.

**Logging requirements:** use structured server logs with request correlation IDs and redacted error context; record authorization failures and provider failures without storing user media or DNA.

### Phase 4 — Testable structure
- [ ] Extract pure model-routing, validation, and prompt-assembly helpers from `App.tsx`.
- [ ] Keep UI behavior stable while moving state orchestration into focused modules or hooks.
- [ ] Add unit tests for registry migration, capability validation, PNG metadata round trips, and safe storage error handling.
- [ ] Add one browser-level smoke test for the non-paid flow: select inputs → build prompt → reach validated preflight.

**Logging requirements:** test logs must be deterministic and must never include credentials, personal image fixtures, or generated private output.

### Phase 5 — Review and handoff
- [ ] Run lint, build, unit tests, and browser smoke test.
- [ ] Review the complete diff for regressions, security, accessibility, and stale model references.
- [ ] Produce `PILOT_REVIEW.md`: completed work, evidence, remaining risks, and next recommended milestone.
- [ ] Open a draft pull request for owner review; do not merge automatically.

## Commit checkpoints

1. `docs: establish BananaTool AIF pilot context`
2. `test: add quality baseline and CI`
3. `feat: modernize Gemini client and model registry`
4. `feat: add secure generation boundary`
5. `refactor: extract generation workflow with tests`

## Owner decisions needed later

- Hosting choice for the server-side Gemini boundary.
- Whether the tool remains single-owner or gains authenticated users.
- The desired Supabase storage privacy and retention policy.
- Which current Gemini image models are enabled by default, after cost and capability review.
- Whether to deploy the completed pilot.