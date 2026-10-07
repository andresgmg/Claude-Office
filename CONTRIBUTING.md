# Contributing to Claude Office

Claude Office is a private, web-only fork of [pixel-agents](https://github.com/pixel-agents-hq/pixel-agents). This file describes the development workflow for the fork. Fixes that are not fork-specific are best contributed to the upstream project as well, so both stay in sync.

The code is licensed under the [MIT License](LICENSE); contributions are too. No CLA or DCO is required.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (use the version in [`.nvmrc`](.nvmrc), currently v22; v20 works)
- [Claude Code](https://code.claude.com/docs/en/overview) for manual testing against real sessions (optional)
- [gitleaks](https://github.com/gitleaks/gitleaks) for the pre-commit secret scan (optional: the hook warns and continues when it is missing)

### Setup

```bash
git clone https://github.com/andresgmg/claude-office.git
cd claude-office
npm install
npm run build
node dist/cli.js --port 3100
```

Open the URL the CLI prints (it carries the `?token=` that enables the hooks toggle). On Windows the same commands work in PowerShell; if PowerShell refuses to run `npm`, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once or call `npm.cmd`.

### Keeping up with upstream

The repository keeps the full pixel-agents history so upstream improvements merge cleanly:

```bash
git remote add upstream https://github.com/pixel-agents-hq/pixel-agents.git
git fetch upstream
git merge upstream/main
```

Keep fork changes small and isolated, and expect conflicts in the files the fork rewrote (`package.json`, `esbuild.js`, `README.md`, `CLAUDE.md`, the webview transport and the server composition).

## Development Workflow

```bash
npm run watch              # esbuild (CLI + hook script) + tsc --noEmit, both in watch mode
npm run dev -w webview-ui  # Vite dev server with a mocked office (no server needed), usually http://localhost:5173
```

The webview is **not** part of `npm run watch`: after changing webview code run `npm run build:webview` or the full `npm run build`, then restart `node dist/cli.js`.

The `.vscode/tasks.json` file ships the same watchers as editor tasks (**watch** and **Mocked Office Dev Server**) for anyone who edits in VS Code; it is editor configuration only, the project has no VS Code extension.

### Project structure

`core/` depends on nothing; `server/` and `webview-ui/` depend only on `core/`. [CLAUDE.md](CLAUDE.md) is the detailed reference and [CONTEXT.md](CONTEXT.md) the glossary whose vocabulary code and docs must use.

| Directory                   | Description                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `core/`                     | Protocol + interface definitions (AsyncAPI 3.0 contract, HookProvider, MessageTransport, StateAdapter). Zero runtime side effects.                                                                                 |
| `server/`                   | Lifecycle runtime (`AgentRuntime`, `AgentStateStore`, `SessionRouter`, `DismissalTracker`), Fastify HTTP/WS server, file watching, transcript parsing, hook installer, the Claude provider, the CLI, Vitest suite. |
| `webview-ui/`               | React 19 + Canvas UI served as the browser SPA. `WebSocketTransport` only. Depends only on `core/`.                                                                                                                |
| `webview-ui/public/assets/` | Bundled sprites, furniture manifests, default layout, fonts.                                                                                                                                                       |
| `scripts/`                  | Tooling: `generate-messages.ts` (AsyncAPI → TS), `validate-asyncapi.mjs`, `run-e2e.mjs`, `generate-e2e-inventory.mjs`, `build-allure-report.mjs`, the package contract and verifier, and the asset editors (HTML). |
| `e2e/`                      | Playwright suite against the real CLI: fixtures, helpers and `tests/standalone/`.                                                                                                                                  |
| `eslint-rules/`             | Custom rules (`no-inline-colors`, `pixel-shadow`, `pixel-font`) enforced project-wide.                                                                                                                             |
| `docs/`                     | `PLAN.md` (roadmap and decisions, Spanish), `remote-hooks.md` (fixed-token `http` hooks, Spanish), `external-assets.md`, `adr/`.                                                                                   |

The repo uses **npm workspaces** (`server`, `webview-ui`). A single `npm install` at the root installs everything.

## Manual Hook Testing

[server/manual-hook-events.http](server/manual-hook-events.http) drives the local hook server with a REST client that understands `.http` files. Start `node dist/cli.js --port 3100`, copy `port` and `token` from `~/.claude-office/server.json` into the file variables and set `cwd` to the folder you started the server from (or enable **Watch All Sessions**). It walks `SessionStart` → `PreToolUse` → `PermissionRequest` / `Notification` / `Stop` → `SessionEnd`.

To test a native `type: "http"` hook end to end, start the server with `--token` and follow [docs/remote-hooks.md](docs/remote-hooks.md).

## Code Guidelines

### Constants

`noUnusedLocals` and `noUnusedParameters` are enabled. Magic numbers and strings are centralized — don't add inline constants:

- **Server timing/scanning, token rules:** `server/src/constants.ts`
- **Claude hook names, script path, backup suffix:** `server/src/providers/hook/claude/constants.ts`
- **Protocol-level constants:** `core/src/constants.ts`
- **Webview:** `webview-ui/src/constants.ts` (grid, animation, rendering, camera, zoom, editor, canvas overlay rgba strings)
- **CSS variables:** `webview-ui/src/index.css` `:root` block (`--pixel-*` properties)

### UI styling

Pixel art aesthetic for every overlay: sharp corners (`border-radius: 0`), solid backgrounds and `2px solid` borders, hard offset shadows (`2px 2px 0px`, no blur — use `var(--pixel-shadow)`), the FS Pixel Sans font. The custom ESLint rules in `eslint-rules/claude-office-rules.mjs` enforce this:

| Rule               | What it checks                                              |
| ------------------ | ----------------------------------------------------------- |
| `no-inline-colors` | No hex/rgb/rgba/hsl/hsla literals outside `constants.ts`    |
| `pixel-shadow`     | Box shadows must use `var(--pixel-shadow)` or `2px 2px 0px` |
| `pixel-font`       | Font family must reference FS Pixel Sans                    |

They are `error`-level and fail `npm run lint`.

### Protocol changes

Edit `core/asyncapi.yaml`, then run `npm run build` (it regenerates `core/src/messages.ts`) and commit both files. `npm run asyncapi:validate` checks the spec on its own.

## Tests

```bash
npm test                        # webview + server (Vitest) + package contract (node --test)
npm run test:server
npm run test:webview
npm run test:package-contract
npm run verify:npm-package      # packs, installs the tarball in a temp project, smoke-tests the CLI
```

`claude-office-hook.test.ts` spawns the bundled hook at `dist/hooks/claude-office-hook.js`, so build before running the server suite. One installer test ("rejects when the .claude directory is not writable") fails when the suite runs as root, because root ignores file modes; run the tests as a normal user.

### End-to-end (Playwright)

```bash
npm run build                                  # tests load dist/cli.js
npx playwright install chromium                # first time only
npm run e2e
npm run e2e -- --grep "consent"
npm run e2e:debug
npm run e2e -- --attach-videos-on-success
npm run e2e:inventory                          # after adding/removing tests; commit e2e/README.md
```

Each test spawns the real CLI with an isolated `HOME` and workspace, opens the printed URL in Chromium and drives the public seams (hook endpoint, SPA, files under `HOME`). Tests never invoke the real `claude`: `e2e/fixtures/mock-claude-runner.cjs` plays `claudeScenario(...)` timelines of JSONL writes and hook POSTs from a separate process. Read [`e2e/README.md`](e2e/README.md) — especially "Test model & rules" — before writing a spec, and tag every test with `@area:<tag>`.

Artifacts land in `test-results/e2e/` (videos for failures, screenshots) and `playwright-report/e2e/` (`npx playwright show-report playwright-report/e2e`). `npm run test:report` builds the combined Allure report; open it with `npm run test:report:open` (not via `file://`).

## Commits and Pull Requests

There is no CI yet. Before pushing, run what CI used to run:

```bash
npm run lint
npm run check-types
npm run asyncapi:validate
npm run build                  # must leave no diff in core/src/messages.ts
npm run e2e:inventory          # must leave no diff in e2e/README.md
npm test
npm run e2e
```

The pre-commit hook (husky + lint-staged) formats and lints staged files and, when gitleaks is installed, scans them for secrets. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages and PR titles (`feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`). PRs follow [the template](.github/pull_request_template.md): what changed and why, how it was tested, screenshots for UI changes, and which e2e tests cover the change.

Never put tokens or the contents of `~/.claude/settings.json` in a commit, an issue or a screenshot.

## Security

See [SECURITY.md](SECURITY.md). This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
