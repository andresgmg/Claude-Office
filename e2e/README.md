# Claude Office e2e tests

Playwright end-to-end tests for the standalone web server. Each test starts the CLI (`dist/cli.js`) with an isolated `HOME` and workspace, then opens the URL the CLI prints in Playwright's Chromium. This README is the single source of truth for what's e2e-tested, what's not, and how to run the suite.

## What this suite covers

Behavioral overview by area. Each area corresponds to a `test.describe` block in the spec files, an `@area:` tag on each test title, and an Allure `epic` label. The suite currently has a single area.

### Standalone server (`@area:standalone`)

The standalone CLI, driven through its public seams: the hook endpoint the installed Claude Code hook script POSTs to, the SPA in a real browser, and the files the product writes under the isolated `HOME`.

- **Hook-driven lifecycle** (`standalone/hooks.spec.ts`) — `SessionStart` only stages a pending session (no character); `PreToolUse` creates the agent and shows its tool label; `PermissionRequest`, `PostToolUse`, `Notification` and `SessionEnd` move the overlay and the `/ws` broadcasts (`agentCreated`, `agentToolStart`, `agentToolPermission`, `agentToolDone`, `agentToolsClear`, `agentStatus`, `agentClosed`) in lockstep.
- **Hooks consent gate** (`standalone/hooks.spec.ts`) — with no seeded consent, the page opened on the printed (tokened) URL shows the Intro, and _Install Hooks_ writes the hook entries to `~/.claude/settings.json` plus a granted `hooksConsent`; a page opened on the bare URL (a spectator) is never asked; after _Not Now_, the Settings checkbox mirrors the real install state and clicking it is the consent grant.
- **Browser UI** (`standalone/ui.spec.ts`) — closing an agent from its overlay despawns the character; Debug View renders JSONL diagnostics; adding an external asset directory re-broadcasts the sprites; Export Layout downloads `claude-office-layout.json`; Import Layout applies the chosen file; the connection indicator appears when the host drops and clears once it is back.

## What's NOT covered (gaps + deferred)

Scenarios that exist as product behavior but are not in the automated suite. PRs that close a gap should remove the corresponding row.

| Scenario                                                                                                                 | Why not automated                                                                                                                                                                                                                                                                                                     | Tracked                      |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Agent lifecycle beyond the basic hook flow (`/clear`, `--resume`, parallel sub-agents, teams, lead `SessionEnd` cascade) | The server-side engine is covered by `server/__tests__`; e2e needs a fixture that spawns `e2e/fixtures/mock-claude-runner.cjs` against the isolated `HOME` so the transcripts and hook POSTs come from a real process                                                                                                 | none                         |
| Hooks-off detection (JSONL polling, heuristic permission timers)                                                         | Same fixture gap: needs a process writing transcripts under `~/.claude/projects`                                                                                                                                                                                                                                      | none                         |
| Layout editor interactions (furniture, carpet, areas, pets)                                                              | The SPA runs unchanged in the browser; specs can drive the editor through the toolbar and the `window.__claudeOfficeTestHooks` surface typed in `e2e/helpers/editor.ts`                                                                                                                                               | none                         |
| External asset pack loading and directory removal                                                                        | Adding a directory is covered at light depth (the re-broadcast fires); loading real sprites needs bundled test asset packs                                                                                                                                                                                            | none                         |
| Intro consent variants (_Don't Ask Again_, _Back_, failed install / uninstall reporting, third-party hook preservation)  | Only the token boundary, the _Install_ route and the checkbox route are pinned e2e; the gate and installer are unit-tested in `server/__tests__` (`consentFlow`, `consentGate`, `claudeHookInstaller`); the remaining variants can be ported onto the standalone fixture with `test.use({ seedHooksConsent: false })` | none                         |
| Producer/viewer relay scenarios (multi-viewer replay, producer reconnect reconciliation)                                 | Producer endpoint not yet built                                                                                                                                                                                                                                                                                       | `feat/producer-viewer-split` |

## Pre-release manual smoke (~20 min)

CI green on this suite is the safety net for behavioral regressions. The checks below are what e2e can't meaningfully assert on (visual polish, real-Claude integration, other browsers). Run them before publishing a release — not on every PR.

**Visual + interactive polish** (after any change touching `renderer.ts`, `spriteCache.ts`, `colorize.ts`, `*.tsx`, CSS, or `editorActions.ts`):

- Pan around the office with middle-mouse drag — characters z-sort correctly against same-row chairs and lower-row desks, no flicker.
- Spawn 3+ agents — matrix spawn animation renders cleanly, characters move smoothly between seats.
- Open the Layout editor — paint floor with HSBC sliders, place + rotate (R) furniture, toggle on/off (T) state, drag-to-move in SELECT, multi-stage Esc unwinds correctly.
- Hover and click characters — overlay text positioning is correct, selection outline crisp, click on a seat reassigns.

**Real Claude Code integration** (the suite POSTs synthetic hook events; real Claude's hooks and JSONL have edge cases the synthetic events don't):

- Run `node dist/cli.js`, open the printed URL, accept the hooks in the Intro, then run a real `claude` session in a terminal: a few tool-heavy turns and a permission-requiring tool. Watch for character desync, missing animations, stuck permission bubbles.
- Use a session with a large pasted image (multi-MB base64 user message) — confirm the "Possible format issue" warning doesn't false-fire and tool tracking still works.
- Test with one MCP server installed — confirm `mcp_progress` records don't break tool status.

**Browsers** (e2e covers Chromium via Playwright):

- Open the printed URL in Firefox AND Safari — confirm characters appear and animate via WebSocket.
- Refresh the browser mid-session — WebSocketTransport reconnects, agents reappear from server state.
- Open the printed URL in a second tab — both tabs show the same office.

**First-run experience** (before publishing):

- Delete `~/.claude-office/` entirely and start the CLI fresh — default layout loads, the Intro appears on the printed URL, no console errors, hooks install when you accept.

**Platform sanity** (CI hosts ≠ your machine):

- On the OS you primarily develop on, run a normal session for ~5 minutes — confirm no surprise CPU spikes, no leaked file watchers, a browser refresh doesn't lose state.

## Running

```bash
cd claude-office
npm run compile && npm run e2e               # full suite (under a minute)

npm run e2e -- --grep "hooks consent"        # filter by describe title
npm run e2e -- --grep "@area:standalone"     # filter by area tag (currently the whole suite)
npm run e2e -- --headed                      # watch chromium

npm run e2e:inventory                        # regenerate the inventory section below
npm run test:report                          # build the Allure dashboard from latest run
npm run test:report:open                     # serve + open the Allure dashboard in a browser
```

`npm run compile` is required first: the fixture spawns the built `dist/cli.js`, which serves the built SPA from `dist/webview/`.

## Test model & rules

E2E tests drive Claude Office through its **public seams**, never by poking internals:

- **The hook endpoint.** Specs POST hook events to `/api/hooks/claude` with the Bearer token from `~/.claude-office/server.json` (`sendHookEvent` in `e2e/helpers/hooks.ts`) — the same request the installed `claude-office-hook.js` makes. The payload builders (`sessionStartStartup`, `preToolUseBash`, ...) mirror real Claude Code events.
- **The browser.** The fixture opens the SPA on the URL the CLI prints, exactly as an operator does. That printed line is the only channel by which a browser obtains the server token, so the fixture never reads the token out of `server.json` to build a URL — a CLI that printed a bare or wrong-tokened URL must turn the suite red, not stay green (see `waitForPrintedUrl` in `e2e/helpers/standalone.ts`).
- **The isolated HOME.** Every test gets a fresh `HOME` and workspace; assertions about persistence read the files the product writes there (`~/.claude/settings.json`, `~/.claude-office/config.json`).

Rules for a correct test:

- **Assert on observable outcomes**: overlays and dialogs on the page, the `/ws` broadcasts the page received (`standalone.drainMessages()`, recorded by a `WebSocket` proxy installed before navigation), the test hooks the SPA exposes for canvas-only state (`window.__claudeOfficeTestHooks`), and files under the isolated `HOME`. Never assert on server internals.
- **Consent is seeded by default.** The fixture writes a granted `hooksConsent` so the Intro never covers the office; only the consent specs opt out with `test.use({ seedHooksConsent: false })`.
- **Follow the wait-strategy conventions** documented in `e2e/helpers/office.ts`: poll for positive assertions, settle briefly before negative ones, re-assert after a fixed wait for stability checks.
- **Drive the real UI.** Settings go through the modal (`e2e/helpers/webview.ts`), the Intro through its buttons (`e2e/helpers/intro.ts`). Test hooks are for reading canvas state, plus the one action a canvas click would otherwise require (`selectAgent`).

`e2e/fixtures/mock-claude-runner.cjs` (with its `mock-claude` / `mock-claude.cmd` PATH wrappers and `tail-follow.cjs`) is a scenario-driven stand-in for the `claude` CLI: it appends JSONL transcripts and runs the installed hook script the way the real CLI does. The e2e suite no longer spawns it; `server/__tests__/mockClaudeRunner.test.ts` pins its hook-execution behavior, and it is the starting point for the lifecycle scenarios listed under "What's NOT covered".

## What to read before adding a test

- `claude-office/CLAUDE.md` — architecture and message protocol
- `claude-office/e2e/fixtures/standalone.ts` — fixture lifecycle (launch, attachments, cleanup)
- `claude-office/e2e/helpers/` — `standalone.ts` (CLI spawn and the printed-URL contract), `hooks.ts`, `office.ts`, `webview.ts`, `intro.ts`

When you add a new test:

- Pick a `test.describe` block that matches an existing `@area:` tag, OR add a new area to the "What this suite covers" section above and pick a tag.
- Add `@area:<tag>` to the test title. The auto-fixture derives the Allure `epic` from it; a new area needs an entry in `AREA_TO_EPIC` (`e2e/helpers/allure-labels.ts`).
- Run `npm run e2e:inventory` and commit the regenerated section.

When you remove a test:

- Run `npm run e2e:inventory` so the inventory drops it.
- If the scenario it tested is now manual or deferred, add a row to "What's NOT covered".

## Test inventory

This section is auto-generated. Do not edit between the markers; CI fails on drift.

<!-- BEGIN:E2E-INVENTORY -->

11 tests total. Generated by `scripts/generate-e2e-inventory.mjs`. Re-run after adding or removing tests.

### `@area:standalone` (11 tests)

- `e2e/standalone/hooks.spec.ts:17` — propagates hook-driven lifecycle into the browser UI (Standalone / hooks)
- `e2e/standalone/hooks.spec.ts:133` — the tokened page shows the Intro and Install writes the hooks (Standalone / hooks consent)
- `e2e/standalone/hooks.spec.ts:160` — an untokened spectator page never sees the consent dialog (Standalone / hooks consent)
- `e2e/standalone/hooks.spec.ts:189` — the hooks checkbox reflects install state and its click is the consent grant (Standalone / hooks consent)
- `e2e/standalone/ui.spec.ts:31` — closeAgent despawns the character (Standalone / UI)
- `e2e/standalone/ui.spec.ts:65` — selecting a character opens the detail panel with its branch and last tool (Standalone / UI)
- `e2e/standalone/ui.spec.ts:120` — Debug View renders JSONL diagnostics in standalone (Standalone / UI)
- `e2e/standalone/ui.spec.ts:154` — adding an external asset directory triggers a live asset reload (Standalone / UI)
- `e2e/standalone/ui.spec.ts:184` — browser Export Layout downloads the layout file (Standalone / UI)
- `e2e/standalone/ui.spec.ts:199` — browser Import Layout applies the chosen file (Standalone / UI)
- `e2e/standalone/ui.spec.ts:234` — ConnectionIndicator appears when the WebSocket connection drops (Standalone / UI)

<!-- END:E2E-INVENTORY -->

## Coverage philosophy

We do not measure e2e via code coverage (too noisy, doesn't map to user-observable scenarios). Coverage is tracked by:

1. **The inventory section above** — every test in the suite with its area tag and file:line.
2. **The "What's NOT covered" gap list** — deliberately maintained; closing a gap removes the corresponding row.
3. **Allure dashboard** — `epic` / `feature` / `story` labels group tests by area without needing this file. Run `npm run test:report` after a suite run, then open `allure-report/allure/index.html` → Behaviors view.
