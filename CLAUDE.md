# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Pipedream monorepo (pnpm workspace, Node 20 / pnpm 10.28.2 — see `.tool-versions`). The bulk of the repo is `components/`: ~3,400 app integrations published to Pipedream's registry. Other workspaces: `platform/` (`@pipedream/platform` — the runtime helper library components import), `packages/sdk` (Pipedream SDK), `packages/connect-react`, `types/`, `helpers/`, `modelcontextprotocol/` (reference MCP server; deprecated in favor of Pipedream's remote MCP server).

## Commands

```bash
pnpm install                      # install all workspace deps (CI uses --frozen-lockfile)
pnpm run build                    # compile TypeScript components (scripts/build-components.mjs)
pnpm test                         # jest over components/ (--passWithNoTests)
pnpm exec jest path/to/file.test.ts   # run a single test file
pnpm run platform-test            # tests for platform/
pnpm run types-test               # tests for types/
pnpm exec eslint components/foo/  # lint (CI lints only changed files)
pnpm exec eslint --fix <files>    # auto-fix lint issues
```

Component validation scripts (run in CI on every PR):

```bash
node scripts/findBadKeys.js <changed files>       # component key matches folder/app slug
node scripts/findDuplicateKeys.js                 # no duplicate component keys repo-wide
node --experimental-loader ./scripts/version-strip-loader.mjs scripts/checkComponentAppProp.js <files>
```

CI also fails a PR if a changed component's `version` (and its app's `package.json` version) was not bumped, and runs a Markdown spellchecker — add legitimate technical words to `.wordlist.txt`.

## Component Architecture

Full guidelines live in `.github/pipedream-component-guidelines.md`, `.github/pipedream-action-guidelines.md`, and `.github/pipedream-source-guidelines.md` — read them before writing or reviewing components. The essentials:

### Layout

Each app lives in `components/{app_slug}/`:

- `{app_slug}.app.mjs` — app connection, shared `propDefinitions`, shared `methods` (API helpers)
- `actions/{action-name}/{action-name}.mjs` — one directory per action
- `sources/{source-name}/{source-name}.mjs` — one directory per source
- `common/` — shared module code (constants, base objects)
- `package.json` — `@pipedream/{app_slug}`; version must be bumped when any component in the app changes

### Component model

Components are ES modules (`.mjs`) exporting a default object with required properties `key` (globally unique, kebab-case, prefixed with app slug), `name`, `description`, `version`, `type` (`"action"` or `"source"`), `props`, and `run()`. ESLint (`@pipedream/eslint-plugin-pipedream`) enforces their presence.

- **Versioning**: every component change bumps `version` (new components start at `0.0.1`); the app `package.json` bumps by the same or greater segment. The CI version check is transitive: editing an app file or `common/` module requires bumping every component that imports it (the failing job prints ready-to-run `sed` commands).
- **Naming enforcement**: directory name, file name, and component `key` (minus the `{app_slug}-` prefix) must match — `scripts/findBadKeys.js` fails CI otherwise. Files named `common*`, files inside `common/` directories, and `test-event.mjs` sample payloads are exempt.
- **Naming**: camelCase for props/methods/variables. API request parameters keep whatever casing the API requires, mapped at the request site.
- **HTTP**: always `axios` from `@pipedream/platform`, never the npm `axios` package. It strips `undefined` from params/body (optional props need no truthiness guards), returns the response body directly, and throws on 4xx/5xx with the original API error message — so do not wrap `run()` in try/catch. Centralize requests in a private `_makeRequest()` in the app file; public methods are verb-noun (`createContact`), private helpers prefixed with `_`.
- **Props**: app connection prop always first. Any prop used by more than one component belongs in the app file's `propDefinitions` and is referenced via `propDefinition: [app, "propName"]`. Dynamic dropdowns use `async options()`, which must support `prevContext` or `page` when the API paginates. Prefer `async options()` over `reloadProps`/`additionalProps` when it can satisfy the use case.
- **Descriptions** double as MCP tool documentation for AI agents: state formats and example values (especially JSON props), cross-reference related tools in **bold** (must match a real action `name` in the same app), and always end component descriptions with a `[See the documentation](https://...)` link.
- **File handling**: file-input props need `format: "file-ref"` plus a `syncDir` prop (`accessMode: "read"` for inputs, `"write"` for outputs); read via `getFileStreamAndMetadata`/`getFileStream` from `@pipedream/platform`.
- **Validation errors**: throw `ConfigurationError` from `@pipedream/platform` for pre-flight input validation only — never to wrap API errors.

### Actions

- Every successful `run()` path must call `$.export("$summary", "...")` with a concise one-line result (IDs, counts) — each branch gets its own summary.
- Every action requires an `annotations` object (`readOnlyHint`, `destructiveHint`, `openWorldHint`) — ESLint enforces presence; values must match behavior (reads → `readOnlyHint: true`; irreversible deletes → `destructiveHint: true`; updates are generally non-destructive; external API calls → `openWorldHint: true`).
- Call APIs through app methods (`this.app.method({ $, ... })`), passing the `$` context — never raw HTTP calls in `run()`.

### Sources

- Sources must **not** have `annotations`.
- Every `this.$emit(data, meta)` needs `id` (stable + unique per real-world event — never `Date.now()`/`Math.random()`; for update events combine record ID with `updated_at`), `summary`, and `ts` (API-provided timestamp when available). Use `dedupe: "unique"`.
- Polling sources: persist cursor/timestamp via the `db: "$.service.db"` prop, encapsulating all db access in private methods (`_getLastTimestamp()`); update state after emitting; handle first run without emitting full history (cap initial emits at ~25); paginate through all new items.
- Webhook sources: `activate()`/`deactivate()` lifecycle methods go in the top-level `hooks` object (not `methods`); persist the webhook registration ID in `db` so `deactivate()` can clean up, and tolerate a missing ID.
