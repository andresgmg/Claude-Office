# Claude Office — Compressed Reference

Pixel art office where Claude agents become animated characters: Claude Code sessions today; Claude Code cloud sessions and Agent SDK agents on the roadmap. Web-only fork of [pixel-agents](https://github.com/pixel-agents-hq/pixel-agents) v1.4.1: one Fastify process serves the browser SPA, the WebSocket protocol and the hook ingress. Run it with `node dist/cli.js` (or `npm start`). There is no editor extension, and the office never launches or attaches terminals — it only observes.

`CONTEXT.md` is the canonical glossary — read it for what terms like Agent, Sub-agent, Teammate, Lead, Adopt, or Headless agent mean here, and use its vocabulary in code, comments, and docs. `docs/PLAN.md` (Spanish) holds the roadmap and the decisions taken with the owner; `docs/remote-hooks.md` (Spanish) documents the fixed-token `http` hook setup.

## Architecture

Strict layering: `core/` depends on nothing; `server/` depends only on `core/`; `webview-ui/` depends only on `core/`. `server/src/cli.ts` is the only composition root.

```
core/                                Protocol + interface definitions (zero runtime side effects)
  asyncapi.yaml                      AsyncAPI 3.0 contract — single source of truth
  src/
    messages.ts                      AUTO-GENERATED discriminated unions (do not edit)
    schemas.ts                       AgentMeta, SpriteData, FurnitureCatalogEntry
    provider.ts                      HookProvider, AgentEvent (the integration boundary)
    teamProvider.ts                  Optional TeamProvider (semantic queries for Lead + Teammates)
    transport.ts                     MessageTransport interface, TransportState
    adapter.ts                       StateAdapter, AssetCache, PersistedAgent, AgentSeat
    paletteUtils.ts                  Character palette helpers shared by server + webview
    normalizeProjectPath.ts
    constants.ts
    assets/                          Asset manifest types

server/                              Lifecycle runtime + Fastify HTTP/WS server + CLI
  src/
    providers/hook/claude/           Reference HookProvider — only place that knows Claude specifics
      claude.ts                      normalizeHookEvent for the installed Claude events, formatToolStatus, file fallback
      claudeTeamProvider.ts          TeamProvider: reads ~/.claude/teams/<name>/config.json
      claudeHookInstaller.ts         Consent-gated install/uninstall in ~/.claude/settings.json (abort on unparseable file or non-array hooks.<Event>; one-time `.claude-office.backup`, exclusive-create, no backup ⇒ no write — but skipped when the replaced content is entirely our own install's output, since backing up our own file masquerades as the user's original (`settingsHoldOnlyOurHooks`, compared against makeHookEntry — the WRITER — so a field added to what we write can't silently revive the bug; only `command`/`timeout` may differ, they vary across installs); every write failure THROWS; mode preserved, 0600 on create; re-read verify immediately before rename + retry; hook identity = `/.claude-office/hooks/claude-office-hook.js` suffix anchored at both ends of the command's first token, case-insensitive; `areHooksInstalled` = ANY of our commands on ANY event)
      consentCopy.ts                 Claude's first-run consent disclosure text (scope/data/undo), served through consentDisclosure()
      constants.ts                   CLAUDE_HOOK_EVENTS (12 installed events), script path, backup suffix
      hooks/claude-office-hook.ts    Hook script (CJS+shebang, bundled to dist/hooks/claude-office-hook.js)
    providers/hook/consentGate.ts    Provider-agnostic consent POLICY: when to ask (hooksConsentRequest per provider) and what an answer means (consentActionFor(choice, {installed, consent}) — see docs/adr/0001)
    providers/hook/consentExecutor.ts Provider-agnostic consent EXECUTION: applyConsentChoice(providerId, choice, ConsentEffects) runs the six actions in one order and SERIALIZES answers per process across ALL providers
    providers/index.ts               Provider registry (claudeProvider + the hookProviders list the consent gate loops over)
    agentRuntime.ts                  Lifecycle core: timers, scanners, HookEventHandler, SessionRouter, DismissalTracker, SubagentWatch
    agentStateStore.ts               EventEmitter-backed single source of truth (typed mutations + events)
    sessionRouter.ts                 session_id → agent_id mapping, event buffering, pending external sessions
    dismissalTracker.ts              Unified dismissal state (replaces four legacy globals)
    hookEventHandler.ts              Dispatches normalized AgentEvent into runtime
    subagentWatch.ts                 Shadow store watching unnamed background spawns' transcripts
    agentActivityResend.ts           Re-sends live tool state to a client that connects mid-work
    agentDiagnostics.ts              Debug View payload (transcript path, offsets, latest records)
    contextUsage.ts                  Context gauge: snapshot from message.usage against the provider's window
    paletteAssigner.ts               Server-side palette + hue assignment at agent creation
    httpServer.ts                    Fastify: POST /api/hooks/:providerId, GET /api/health, GET /ws, SPA
    clientMessageHandler.ts          Single dispatch point for ClientMessage from the browser
    server.ts                        Top-level composition (reuse-or-start, registry entry, token)
    serverConfig.ts                  ~/.claude-office/server.json + servers/ registry read/write
    cli.ts                           `claude-office` entry: parseArgs (--port/--host/--token/--help), validateToken
    fileStateAdapter.ts              Namespaced ~/.claude-office/<namespace>-state.json persistence
    configPersistence.ts             { standalone, externalAssetDirectories, hooksConsent: {providerId: granted|declined}, hooksEnabled: {providerId: boolean} }
    layoutPersistence.ts             ~/.claude-office/layout.json with atomic tmp+rename
    fileWatcher.ts                   Hybrid fs.watch + 500ms polling, JSONL line buffering, external-session scanning
    transcriptParser.ts              JSONL parsing for heuristic / file-fallback mode
    assetLoader.ts / assetReload.ts  PNG → SpriteData via pngjs; external directory reloads
    timerManager.ts                  Waiting / permission timers
    teamUtils.ts                     isInlineTeammateOf, getInlineTeammates, hasInlineTeammates
    pathKey.ts                       Case/separator-insensitive path keys (Windows-safe)
    types.ts                         ServerAgentState
    constants.ts                     All timing/scanning constants, TOKEN_ENV_VAR, MIN_AUTH_TOKEN_LENGTH
  __tests__/                         28 Vitest files
  manual-hook-events.http            Manual hook testing helper (REST-Client format)

webview-ui/                          React 19 + Canvas UI (depends only on core/)
  src/
    transport/
      index.ts                       createTransport() — builds the WebSocketTransport, forwards ?token=
      webSocketTransport.ts          Exponential backoff, send queue
      types.ts                       Re-exports MessageTransport from core
    runtime.ts                       isE2E flag (Playwright harness only)
    browserMock.ts                   Vite dev server: asset fetch + message injection without a server
    testHooks.ts                     window globals exposed for e2e (officeState, helpers)
    main.tsx                         React entry (StrictMode + createRoot)
    App.tsx                          Composition root (hooks + components + EditActionBar)
    constants.ts                     Webview magic numbers/strings
    notificationSound.ts             Web Audio API chime
    changelogData.ts                 Changelog modal content (fork entries only)
    components/                      React UI
      BottomToolbar.tsx (Layout + Settings), SettingsModal.tsx, IntroBubble.tsx, ChangelogModal.tsx,
      ConnectionIndicator.tsx, DebugView.tsx, EditActionBar.tsx, VersionIndicator.tsx,
      VisualColorPicker.tsx, ZoomControls.tsx, Tooltip.tsx, ui/Button.tsx
    hooks/
      useExtensionMessages.ts        Message handler — translates ServerMessage into OfficeState mutations
      useEditorActions.ts            Editor state + callbacks
      useEditorKeyboard.ts           Keyboard shortcuts (R, T, Esc, Ctrl+Z/Y)
      introTourState.ts              Intro tour wire-state machine (pure reducer, Node-runner tested)
      useIntroTour.ts                Wires the reducer to React + transport (snapshot, verdict, choices)
    office/
      types.ts                       OfficeLayout, Character, etc. + re-exports constants
      toolUtils.ts                   STATUS_TO_TOOL mapping, extractToolName (DOM-free)
      projection.ts                  World→screen math shared by renderer + DOM overlays
      colorize.ts                    Colorize (grayscale→HSL) + Adjust (HSL shift)
      floorTiles.ts / wallTiles.ts   Floor sprite storage + colorized cache; wall auto-tile bitmask
      sprites/                       spriteData.ts, spriteCache.ts (per-zoom WeakMap)
      editor/                        editorActions.ts (pure layout ops), editorState.ts, EditorToolbar.tsx
      layout/                        furnitureCatalog.ts, layoutSerializer.ts, tileMap.ts (BFS pathfinding)
      engine/                        characters.ts (FSM + wander), officeState.ts, gameLoop.ts, renderer.ts, matrixEffect*.ts
      components/                    OfficeCanvas.tsx (canvas, DPR, hit-testing), ToolOverlay.tsx (activity label)
  test/                              10 Vitest files (Node runner)

e2e/                                 Playwright suite against the real CLI (standalone only)
  playwright.config.ts, run-config.ts, global-setup.ts
  fixtures/
    standalone.ts                    Spawns dist/cli.js with an isolated HOME + opens the printed URL
    mock-claude, mock-claude.cmd     Bash + cmd wrapper invoked instead of real claude
    mock-claude-runner.cjs           Scenario runner: appendJsonl, emitHook, holdOpen
    tail-follow.cjs                  Follows a file for scenario timing
  helpers/                           standalone.ts, hooks.ts, intro.ts, office.ts, webview.ts, editor.ts, layout-seed.ts, allure-labels.ts
  tests/standalone/                  hooks.spec.ts, ui.spec.ts (10 tests, @area:standalone)
  README.md                          Auto-generated test inventory (regen via npm run e2e:inventory)

scripts/
  generate-messages.ts               AsyncAPI → core/src/messages.ts via Modelina
  validate-asyncapi.mjs              AsyncAPI spec validation
  run-e2e.mjs                        Playwright wrapper (run-id namespacing, video attach flags)
  generate-e2e-inventory.mjs         Splices test list into e2e/README.md
  build-allure-report.mjs            Combine e2e+server+webview Allure results
  npm-package-contract.mjs (+ .test) Tarball shape contract (name, repository, required files)
  verify-npm-package.mjs             Packs, installs the tarball in a temp project, smoke-tests the CLI
  asset-manager.html                 Furniture manifest editor (positions + metadata)
  jsonl-viewer.html                  Standalone JSONL transcript inspector
  wall-tile-editor.html              Wall sprite editor

core/                                npm workspace (no separate package; root manages)
server/                              npm workspace (`claude-office-server`, private)
webview-ui/                          npm workspace
```

## Distribution

One artifact, built from source. `npm run build` produces `dist/cli.js` (server + CLI, externals `fastify`/`@fastify/*` resolved from `node_modules`), `dist/hooks/claude-office-hook.js`, `dist/assets/` and `dist/webview/`; `node dist/cli.js` runs the server and serves the SPA on the same port. The root package is `private: true` and is not published. `package.json:files` and `scripts/npm-package-contract.mjs` still pin the tarball shape (`npm run test:package-contract`, `npm run verify:npm-package`) so `npm pack` keeps working if distribution ever changes.

## Communication Flow

Hub-and-spoke. The server is the single aggregation point for all agent activity, regardless of source.

```
Hook script / native http hook ─POST /api/hooks/:providerId─┐
  (Authorization: Bearer <token>)                           ├─→ HookProvider.normalizeHookEvent()
JSONL transcripts ─FileWatcher─→ TranscriptParser ──────────┤
                                                            ↓
                                                       AgentEvent (canonical)
                                                            ↓
                                                       AgentRuntime (dispatch on .kind)
                                                            ↓
                                                    AgentStateStore (mutate)
                                                            ↓
                                                       StoreEvents → broadcast
                                                            ↓
                                                   WebSocketTransport (/ws) → browser SPA
```

`POST /api/hooks/claude` accepts the raw JSON Claude Code hands its hooks. The bundled hook script and a native `type: "http"` hook (see `docs/remote-hooks.md`) post the same payload, so remote machines, cloud sessions and Agent SDK agents need no new ingress — only a stable token.

The fork is Claude-only by decision. The provider seam (`server/src/providers/hook/<id>/`) still exists because the runtime was built around it, but new providers are out of scope; the Agent SDK adapter planned for phase 1 feeds the Claude provider instead of adding one.

## AsyncAPI Protocol Contract

`core/asyncapi.yaml` is the contract. Pinned to **3.0.0** because `@asyncapi/modelina@5.10.1` declares `supportedVersions: ['3.0.0']` only; bumping to 3.1.0 produces `export type Root = any`. Revisit when Modelina ships 3.1.0 support.

- **29 ServerMessage variants** (server → client): `providerCapabilities`, agent lifecycle (`agentCreated`, `agentClosed`, `existingAgents`, `agentStatus`), agent activity (`agentToolStart/Done/sClear`, `agentToolPermission/Clear`), sub-agent activity (`subagentToolStart/Done`, `subagentClear`, `subagentToolPermission`), `agentTeamInfo`, `agentContextUsage`, assets (`layoutLoaded`, `furnitureAssetsLoaded`, `characterSpritesLoaded`, `petSpritesLoaded`, `floorTilesLoaded`, `wallTilesLoaded`, `carpetTilesLoaded`, `externalAssetDirectoriesUpdated`), settings (`settingsLoaded`, `hooksStatus`, `hooksConsentRequest`, `areaMappingsLoaded`), `agentDiagnostics`.
- **17 ClientMessage variants** (client → server): `webviewReady`, `closeAgent`, layout (`saveAgentSeats`, `saveLayout`, `saveAreaMappings`, `setShowAreas`), settings (`setSoundEnabled`, `setHooksEnabled`, `hooksConsentResponse`, `setWatchAllSessions`, `setAlwaysShowLabels`, `setGhostHeadlessAgents`, `setHooksInfoShown`, `setLastSeenVersion`), assets (`addExternalAssetDirectory` with a required `path`, `removeExternalAssetDirectory`), `requestDiagnostics`.

The IDE-only messages of the upstream protocol (`agentSelected`, `workspaceFolders`, `launchAgent`, `focusAgent`, `exportLayout`, `importLayout`, `openSessionsFolder`) were removed; layout export/import happens in the browser.

Both unions use `oneOf` with `discriminator: type`. Every concrete message sets `additionalProperties: false`.

`core/src/messages.ts` is generated by `scripts/generate-messages.ts` invoking `@asyncapi/modelina` with custom constraints (`propertyKey` preserves `type`/`status` field names; `constant` inlines `const` literals). The file has an auto-generation banner. **There is no CI**: `npm run build` runs `asyncapi:generate` first, so after editing the contract run the build and commit the regenerated file together with the YAML.

## Transport

```typescript
export interface MessageTransport {
  send(msg: ClientMessage): void;
  onMessage(handler: (msg: ServerMessage) => void): () => void;
  readonly ready: Promise<void>;
  readonly state: TransportState;
  onStateChange(handler: (state: TransportState) => void): () => void;
  dispose(): void;
}
export type TransportState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
```

`WebSocketTransport` is the only implementation: it reconnects with exponential backoff (250 ms, 500 ms, 1 s, 2 s, 4 s, capped) and queues sends while disconnected. `createTransport()` in `webview-ui/src/transport/index.ts` builds it and forwards the page's `?token=` onto the `/ws` handshake. Everything downstream uses the `MessageTransport` interface; the abstraction stays so a second wire (phase 2 relay) can be added without touching the UI.

## Provider Abstraction

`HookProvider` (`core/src/provider.ts`) is the integration boundary. Only Claude Code is implemented; the Claude provider supports every transcript/hook format up to **Claude Code v2.1.220** (current as of 2026-07-30 — Task-era `agent_progress` records, explicit and implicit teams, background-by-default Agent spawns, sidecar-backed background agents). Newer CLI releases may add formats that need provider updates. The interface:

- **Required**: `normalizeHookEvent(raw)` → `{ sessionId, event: AgentEvent } | null`; `installHooks` / `uninstallHooks` / `areHooksInstalled`; `formatToolStatus`; `permissionExemptTools`, `subagentToolNames`, `readingTools` sets.
- **Optional file fallback**: `getSessionDirs(workspace)`, `getAllSessionRoots()`, `sessionFilePattern`, `parseTranscriptLine(line)`, `contextWindowForModel(model)`. Used when hooks aren't installed. `buildLaunchCommand` remains in the interface for upstream parity but nothing calls it — the office never launches agents.
- **Optional team extension**: `team?: TeamProvider` for Lead + Teammates support.

`AgentEvent.kind` values: `toolStart`, `toolEnd`, `turnEnd`, `subagentStart`, `subagentEnd`, `subagentTurnEnd`, `progress`, `permissionRequest`, `sessionStart`, `sessionEnd`. The runtime dispatches on `kind`, never on CLI-specific tool names.

### TeamProvider (Lead + Teammates)

Optional extension for team workflows (Claude Agent Teams). Semantic queries (`discoverTeammates`, `getTeamMembers`, `getTeamMetadataForSession`, `extractTeammateNameFromEvent`, `isTeammateSpawnCall`) — providers choose their own storage strategy.

Four teammate modes:

| Mode                            | Trigger                                          | Detection                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basic subagent (teams OFF)      | `Task(...)` or `Agent(run_in_background: false)` | `subagentStart` with team gate not matched, or JSONL `agent_progress`                                                                                                                                                                                                                                                                                                                   |
| Inline teammate (teams ON)      | `Agent(run_in_background: true)` in-process      | `onTeammateDetected` → `discoverTeammates(projectDir, leadSessionId)`                                                                                                                                                                                                                                                                                                                   |
| Session teammate (teams + tmux) | `Agent(run_in_background: true)` in tmux pane    | Own session, own hooks, routes through normal flow                                                                                                                                                                                                                                                                                                                                      |
| Implicit-team agent (Claude 5)  | `Agent(...)` — background by default, NO flag    | Lead-side: spawn tool_result `agent_id: <name>@<team>` → `extractTeammateSpawnFromToolResult` sets lead `teamName`; teammate = own top-level UUID session tagged `teamName`/`agentName` on every record, discovered by `discoverTeammates(projectDir, leadSessionId, teamName)` and fast-attached in `onExternalSessionDetected` (bypasses the Watch All gate when the lead is tracked) |

Newer harnesses (Claude 5) never tag the LEAD's records with team metadata and never write `agent_progress`/`queue-operation` records for these spawns — the spawn tool_result and the teammate's own session (own JSONL, own hooks) are the only signals. The implicit team writes `~/.claude/teams/session-<8hex>/config.json` (its `leadSessionId` matches no transcript on disk — don't link by it). Own-session teammates are registered with the SessionRouter (`setTeammateRegisterCallback`) so their hooks route directly to them.

**Team generations on resume (last-wins latch)**: every CLI run of a session mints a FRESH implicit team, so a resumed lead's transcript carries spawn tool_results from several `session-<8hex>` generations. A tag-less lead re-latches to the newest spawn's team (`setTeamSwitchCallback` removes the defunct team's teammates); tag-derived identity (`teamNameFromTags`, set by the record-tags branch) is authoritative and never overwritten by spawn results. `linkTeammates` never badges a named teammate as LEAD — if only teammates are tracked, linking waits until the real lead is detected (prevents a phantom LEAD character when a teammate session is adopted before/without its lead). Restore drops `isTeamLead` from persisted agents that carry an `agentName`.

**Background spawns without a CLI team (sidecar-backed)**: `Agent(...)` spawns that never register a team take the async path — result "Async agent launched successfully. agentId: \<hex>" (no team anywhere), transcript + sidecar under `<projectDir>/<leadSessionId>/subagents/` (sidecar carries `agentType`/`description`/`toolUseId`, plus `name` when the spawn was named), completion via `queue-operation`. `scanForBackgroundAgentFiles` classifies them by the sidecar `name` — the domain model's sole Sub-agent vs Teammate distinction (see CONTEXT.md):

- **Named → Teammate**: its own seated character, `agentName` from the sidecar `name`; the spawner gets `isTeamLead` + an `agentTeamInfo` broadcast (derived team — NO `teamName`, so config polling stays away) and the transient Subtask is ghost-killed via `subagentClear`. The child has `leadAgentId` + `spawnToolUseId`; it's removed on the completion queue-operation or lead sessionEnd (`removeTeammate` must NOT unregister its session — it shares the lead's).
- **Unnamed → Sub-agent**: the Subtask sub-character stays; the spawn's transcript is watched in a **shadow `AgentStateStore`** (`server/src/subagentWatch.ts`, owned by `AgentRuntime`, ids from 1 000 000 up) whose broadcasts are translated onto the main store as `subagentToolStart/Done/Permission` keyed `(leadId, spawnToolUseId)` — live activity on the sub-character, no protocol change. `agentToolsClear` on the shadow agent synthesizes `subagentToolDone` for still-live tools so the sub idles between turns. Never persisted, never announced.

The gate for both: the sidecar `toolUseId` must match a LIVE entry in the lead's `backgroundAgentToolIds` (anti-spurious; no teamName involved). `scanForTeammateFiles` skips sidecars carrying a live `toolUseId` so it can't race the classification. The lead's `backgroundAgentToolIds` are persisted (children never are — they're derived state the 1 s scan re-materializes after a reload; restore skips stale entries with `leadAgentId` but no `teamName`). The turn-end background-tool re-sends (transcriptParser, hookEventHandler, timerManager's `clearAgentActivity`) must include `toolName` + `runInBackground` (or the webview can't recreate the Subtask after `agentToolsClear`) and must skip tools whose spawn became a teammate character (`hasPromotedBackgroundAgent`, or a ghost Subtask appears next to it).

Teammate dismissal is driven by team config polling (`getTeamMembers(teamName)` is authoritative; members with `isActive: false` are treated as departed), by the teammate's own `sessionEnd` (own-session teammates), and by `sessionEnd` on the lead.

**Subtle gate (the one that bit upstream)**: in `webview-ui/src/hooks/useExtensionMessages.ts`, `agentToolStart` with `runInBackground=true` only creates a Subtask sub-character when the **parent has no `teamName`**. With a team, `onTeammateDetected` creates the teammate instead (and the gate prevents a ghost sub-agent). Without a team, the teammate path never fires and the basic Subtask sub-character is the only visible representation. The gate's blind spot — a TEAMED lead's unnamed background spawn — is covered by `subagentToolStart` creating the sub-character lazily when it's missing (`addSubagent` is idempotent); the same lazy path recreates subs after a page reload.

## Server Runtime

`AgentRuntime` (`server/src/agentRuntime.ts`) is the lifecycle core; `cli.ts` composes exactly one.

```typescript
export class AgentRuntime {
  constructor(store: AgentStateStore, provider: HookProvider);
  registerAgent / unregisterAgent / removeAgent / removeTeammate / removeTeammates
  restoreExternalAgents / handleHookEvent
  startProjectScan(projectDir) / startExternalScanning(projectDir) / startStaleCheck()
  dispose();
}
```

The constructor wires the module-level singletons (`DismissalTracker`, hook provider for `fileWatcher`, `SubagentWatch`, the team provider, removal callbacks). It owns timer Maps (waiting, permission, text-idle, stale), scanners (project-dir 1 s, external 3 s, stale 30 s — `PROJECT_SCAN_INTERVAL_MS`, `EXTERNAL_SCAN_INTERVAL_MS`, `EXTERNAL_STALE_CHECK_INTERVAL_MS`), `HookEventHandler` and `SessionRouter`. Scanners are skipped entirely while hooks are flowing (`hookDelivered` is set on every agent). The project dir is `process.cwd()` at CLI start; **Watch All Sessions** widens the external scanner to every session root.

### AgentStateStore

EventEmitter-backed container in `server/src/agentStateStore.ts`. Typed mutations, typed events (`agentAdded`, `agentRemoved`, `agentUpdated`, `broadcast`). The broadcast layer subscribes once at boot and translates `StoreEvents` into `ServerMessage` over the WebSocket. **No module under `server/` calls a transport method directly.**

### SessionRouter and DismissalTracker

`SessionRouter` owns `session_id → agent_id` mapping, pre-registration event buffering, and pending external sessions. `DismissalTracker` unifies four legacy globals (`dismissedJsonlFiles`, `clearDismissedFiles`, `seededMtimes`, `pendingClearFiles`) into one class with typed reasons.

### HTTP + WebSocket Server

Fastify v5 with `@fastify/cors`, `@fastify/websocket` and `@fastify/static`:

| Method | Path                     | Purpose                                                        |
| ------ | ------------------------ | -------------------------------------------------------------- |
| POST   | `/api/hooks/:providerId` | Bearer-authenticated hook event ingress (raw Claude hook JSON) |
| GET    | `/api/health`            | Liveness: `{ ok, version, port, pid }`                         |
| GET    | `/ws`                    | Bidirectional protocol channel                                 |
| GET    | `/*`                     | Browser SPA via `@fastify/static`                              |

**The token.** Random UUID per start, or fixed with `--token` / `CLAUDE_OFFICE_TOKEN` (`validateToken` in `cli.ts`: at least `MIN_AUTH_TOKEN_LENGTH` = 16 characters, no whitespace; the flag wins over the env var). A fixed token is what lets a native `type: "http"` hook — on this machine, a remote one, or a cloud session — be configured once. When a start finds a running server it reuses it and keeps that server's token, warning if a different one was requested.

`/ws` is gated in **two tiers**, because `setHooksEnabled(true)` over this socket is a durable, machine-wide consent grant plus a hook install.

1. **Connection** (`isAllowedWebSocketOrigin`): same-origin handshake. A missing Origin still connects (non-browser clients send none). This tier is weak by design — a DNS-rebound page sends `Origin` and `Host` as the same attacker-chosen name and IS accepted (`httpServerWs.test.ts` pins that).
2. **Privileged messages** (`standaloneTokenValid`, `ClientMessageContext.privileged`): proved by the server token in the `/ws` `?token=` query, which the CLI prints in the local URL and the SPA forwards. **Never a network position**: peer address, `Host` and `Origin` all ride the channel a proxy speaks, so a LAN-bound forwarder piping bytes to 127.0.0.1 satisfies all three. The token is a replayable bearer capability, not evidence of locality — it also reaches browser history, so the printed URL is documented to the user as a secret. An untokened client still watches the office; it just cannot change `~/.claude/settings.json`.

The **hooks preference is persisted only after the install/uninstall settled and the on-disk result agrees** — writing it first strands the user when an uninstall fails: entries still firing, but a persisted hooks-off makes the next startup skip the consent/install path entirely.

**Discovery.** `~/.claude-office/server.json` holds `{ port, pid, authToken, servesSpa }` for the current server and `~/.claude-office/servers/<pid>-<port>.json` registers every live process; the hook script fans each event out to all live registrations and prunes dead PIDs. A second `claude-office` start finds a live `servesSpa` entry and reuses it instead of binding another port.

### ClientMessageHandler

Single dispatch point for `ClientMessage`. Each variant calls into `AgentRuntime`, `AgentStateStore`, `LayoutPersistence`, or `FileStateAdapter`; the only host callbacks are `onSetHooksEnabled` (consent + install) and `onReloadAssets` (external directory change).

### ServerAgentState (server/src/types.ts)

Per-agent runtime data: provider reference, session key, transcript-fallback fields (`jsonlFile`, `fileOffset`, `lineBuffer`), tool state Maps and Sets, team fields (`teamName`, `agentName`, `isTeamLead`, `leadAgentId`, `teamUsesTmux`), context usage (`contextTokens`, `maxContextTokens`, `sawMainChainUsage`), and the **`hookDelivered`** flag that suppresses heuristic timers when hooks are flowing. Every agent is external (adopted); there is no terminal reference.

## Persistence

```
~/.claude-office/
  config.json                  { standalone, externalAssetDirectories, hooksConsent, hooksEnabled (both per-provider) }
  standalone-state.json        { agents, seats }
  layout.json                  OfficeLayout
  server.json                  { port, pid, authToken, servesSpa }
  servers/<pid>-<port>.json    Live-server registry the hook script fans out to
  hooks/claude-office-hook.js  Bundled hook script (CJS, shebang)
```

`FileStateAdapter({ namespace: 'standalone' })` is the only state adapter (`ConfigNamespace = 'standalone'`). Settings under the namespace: `soundEnabled`, `lastSeenVersion`, `alwaysShowLabels`, `watchAllSessions`, `hooksInfoShown`, `ghostHeadlessAgents`; the hooks preference and consent are per-provider and machine-global, at the config top level.

Layout writes are atomic via tmp + rename. There is no cross-process layout watcher: one server owns the file.

Nothing migrates from `~/.pixel-agents/`. A user coming from pixel-agents copies `layout.json` by hand and removes the old hook entries from `~/.claude/settings.json` (this installer only recognizes `/.claude-office/hooks/claude-office-hook.js`).

## Agent Status Tracking

JSONL transcripts at `~/.claude/projects/<project-hash>/<session-id>.jsonl`. Project hash = workspace path with `:`/`\`/`/` → `-`.

**JSONL record types**: `assistant` (tool_use or thinking), `user` (tool_result or text prompt), `system` with `subtype: "turn_duration"` (reliable turn-end signal), `progress` with `data.type`: `agent_progress` (sub-agent tool_use/tool_result, non-exempt tools trigger permission timers), `bash_progress` (Bash output — restarts permission timer), `mcp_progress` (MCP tool — same timer restart). Also observed but not tracked: `file-history-snapshot`, `queue-operation`.

**File watching**: 500 ms polling with partial-line buffering for mid-write reads. Tool-done messages delayed 300 ms to prevent React batching from hiding brief active states.

### Dual-mode detection

| Mode                     | Source                                                 | Detection                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hooks** (preferred)    | Claude Code Hooks API → HTTP POST → `HookEventHandler` | Instant, reliable. Installed events are `CLAUDE_HOOK_EVENTS` (SessionStart, SessionEnd, Stop, PermissionRequest, Notification, PreToolUse, PostToolUse, PostToolUseFailure, SubagentStart, SubagentStop, TeammateIdle, TaskCompleted). `UserPromptSubmit`/`TaskCreated` are deliberately NOT installed — they normalize to null; `normalizeHookEvent` still tolerates them |
| **Heuristic** (fallback) | Polling JSONL files                                    | Per-agent 500 ms JSONL polling; 1 s project scanner adopts new sessions of the start directory; 3 s external scanner (every session root with Watch All Sessions); 30 s stale check                                                                                                                                                                                        |

The `hookDelivered` flag (per agent) and `hooksEnabled` (global) gate timer logic. JSONL polling always runs in both modes for tool content (status text, animations); only permission (7 s) and text-idle (5 s) timers are suppressed by `hookDelivered`.

`SessionStart` alone only stages a pending session; the first follow-up event (`PreToolUse`, `Stop`, `Notification`, `PermissionRequest`) creates the agent. Hook-only sessions (no `transcript_path`, e.g. a remote machine) are full agents without a context gauge or Debug View transcript data.

### Sub-agent permission detection (heuristic)

When a sub-agent runs a non-exempt tool, `startPermissionTimer` fires on the parent agent. If `PERMISSION_TIMER_DELAY_MS` (7 s) elapses with no data, permission bubbles appear on both parent and sub-agent characters via `agentToolPermission` + `subagentToolPermission` broadcasts.

`activeSubagentToolNames: Map<parentToolId, Map<subToolId, toolName>>` tracks which sub-tools are active for the exempt check. Cleared when data resumes, Task completes, or `turn_duration` arrives.

**Timing budget for tests**: the test waits for the bubble AFTER waiting for the "Subtask:" overlay. But the Subtask overlay appears when the parent's **Task tool_use** is parsed (scenario time T), while the timer only starts when the **sub-tool tool_use** in the progress record is parsed (~1 s later). Plus 7 s timer + 300 ms IPC/render slop = a wait timeout less than ~10 s is unsafe.

### Context usage (server/src/contextUsage.ts)

Every agent's context gauge. Fed from `message.usage` on assistant records by `processTranscriptLine`, broadcast as `agentContextUsage` and rendered by `ToolOverlay`.

- **Snapshot, not a total.** Context = the newest turn's `input_tokens + cache_creation_input_tokens + cache_read_input_tokens + output_tokens`. Summing turns measures spend, not occupancy, and misses the cached tokens that ARE the context (`input_tokens` is single digits once caching kicks in). Falls on compaction and `/clear` for free.
- **All-zero usage means "no news"** — synthetic records (API errors, interrupts) report zeros and must not blank the gauge.
- **Sidechain rule**: a lead's sidechain records are its sub-agents' turns and must not move its gauge; a teammate's own transcript is sidechain top to bottom and would otherwise never report. Positional latch (`sawMainChainUsage`): once a file produces a main-chain turn, later sidechain records belong to someone else.
- **The window comes from the provider**, not from the runtime: `HookProvider.contextWindowForModel(model)` (Claude: 1M for the current line, 200k for Haiku and the older models, `undefined` for ids it can't place). Transcripts state usage but never the limit, and guessing 200k for a 1M model reads five times too full. `widenContextWindow` is the backstop for unrecognized models and unknown-larger windows — it only ever widens, since a context that doesn't fit disproves the assumption while a shrinking one proves nothing.
- **`seedContextUsage` runs once per agent in `startFileWatching`** — the single seam every watched agent passes through. Agents adopted or restored mid-session start at end-of-file, so without a tail read they'd have no gauge until their next turn.
- Sub-agents get no gauge: no session of their own, and the shadow store never forwards `agentContextUsage`.

## Office UI

**Rendering**: Game state in imperative `OfficeState` class (not React state). Pixel-perfect: zoom = integer device-pixels-per-sprite-pixel (1x–10x). No `ctx.scale(dpr)`. Default zoom = `Math.round(2 * devicePixelRatio)`. Z-sort all entities by Y. Pan via middle-mouse drag (`panRef`). **Camera follow**: `cameraFollowId` (separate from `selectedAgentId`) smoothly centers camera on the followed agent; set on agent click, cleared on deselection or manual pan.

**UI styling**: Pixel art aesthetic — sharp corners (`borderRadius: 0`), solid backgrounds (`#1e1e2e`), `2px solid` borders, hard offset shadows (`2px 2px 0px #0a0a14`, no blur). CSS variables in `index.css` `:root` (`--pixel-bg`, `--pixel-border`, `--pixel-accent`, ...). Pixel font: FS Pixel Sans (`webview-ui/src/fonts/`), loaded via `@font-face`, applied globally.

Custom ESLint rules (`eslint-rules/claude-office-rules.mjs`, prefix `claude-office/`) enforce: `no-inline-colors` (hex/rgb/rgba/hsl/hsla literals only in `constants.ts`), `pixel-shadow` (must use `var(--pixel-shadow)` or `2px 2px 0px`), `pixel-font` (must reference FS Pixel Sans). All `error`-level.

**Characters**: FSM states — active (pathfind to seat, typing/reading animation by tool type), idle (wander randomly with BFS, return to seat after `wanderLimit` moves). 4-directional sprites, left = flipped right. Tool animations: typing (Write/Edit/Bash/Task) vs reading (Read/Grep/Glob/WebFetch). Sitting offset: characters shift down 6 px in TYPE state. Z-sort uses `ch.y + TILE_SIZE/2 + 0.5` so characters render in front of same-row furniture but behind lower-row furniture. **Chair z-sorting**: non-back chairs use `zY = (row+1)*TILE_SIZE` (capped to first row); back-facing chairs use `zY = (row+1)*TILE_SIZE + 1` so the chair back renders in front of the character. Chair tiles are blocked for all characters except their own assigned seat (per-character pathfinding via `withOwnSeatUnblocked`).

**Palette assignment** is server-side (`paletteAssigner.ts`, broadcast on `agentCreated`/`existingAgents`) so every connected browser sees the same colors: least-used palette first; the first 6 agents each get a unique skin, beyond 6 skins repeat with a random hue shift (45–315°) via `adjustSprite()`. Character stores `palette` (0-5) + `hueShift` (degrees). Sprite cache keyed by `"palette:hueShift"`.

**Spawn/despawn effect**: Matrix-style digital rain animation (0.3 s). 16 vertical columns sweep top-to-bottom with staggered timing. Spawn: green rain reveals character pixels. Despawn: character pixels consumed by green rain trails. `matrixEffect` field on Character (`'spawn'`/`'despawn'`/`null`). Normal FSM is paused during effect. Restored agents (`existingAgents`) use `skipSpawnEffect: true` to appear instantly.

**Sub-agents**: Negative IDs (from -1 down). Created on `agentToolStart` with "Subtask:" prefix, or lazily by `subagentToolStart` when missing (watched background spawns, post-reload recreation). Same palette + hueShift as parent. Clicking one selects its parent. Not persisted. Spawn at the closest free walkable tile to the parent (`closestFreeWalkableTile`) — around it, never in a seat. Idle (stop typing) when every tracked sub-tool row is done; overlay shows the latest non-done sub-tool status, falling back to the Subtask label.

**Headless cue**: upstream rendered adopted agents translucent ("Display Headless as Ghosts"). Here every agent is adopted, so the cue is disabled at the source (`HEADLESS_CUE_ENABLED = false` in `useExtensionMessages.ts`); the setting, the `setGhostHeadlessAgents` message and `HEADLESS_CHARACTER_ALPHA` remain only until their scheduled removal.

**Speech bubbles**: Permission ("..." amber dots) stays until clicked/cleared. Waiting (green checkmark) auto-fades 2 s. Sprites in `spriteData.ts`.

**Sound notifications**: Ascending two-note chime (E5 → E6) via Web Audio API plays when waiting bubble appears (`agentStatus: 'waiting'`). `notificationSound.ts` manages AudioContext lifecycle; `unlockAudio()` on canvas mousedown resumes the context (pages start suspended). Toggled via Settings modal. Persisted in `~/.claude-office/config.json`.

**Seats**: Derived from chair furniture. `layoutToSeats()` creates a seat at every footprint tile of every chair. Multi-tile chairs produce multiple seats keyed `uid` / `uid:1` / `uid:2`. Facing direction priority: 1) chair `orientation` from catalog (front→DOWN, back→UP, left→LEFT, right→RIGHT), 2) adjacent desk direction, 3) forward (DOWN). Click character → select (white outline) → click available seat → reassign.

**Areas**: named tile regions mapped to project folders (`saveAreaMappings`); the folder list the Settings modal offers is derived from the tracked agents' folder names (`agentFolderNames`), since there is no IDE workspace to enumerate.

## Layout Editor

Toggle via "Layout" button. Tools: SELECT (default), Floor paint, Wall paint, Erase (set tiles to VOID), Furniture place, Furniture pick (eyedropper for furniture type), Eyedropper (floor).

**Floor**: 7 patterns from `floors.png` (grayscale 16×16), colorizable via HSBC sliders (Photoshop Colorize). Color baked per-tile on paint. Eyedropper picks pattern+color.

**Walls**: Separate Wall paint tool. Click/drag to add walls; click/drag existing walls to remove (toggle direction set by first tile of drag, tracked by `wallDragAdding`). HSBC color sliders (Colorize mode) apply to all wall tiles at once. Eyedropper on a wall tile picks its color and switches to Wall tool. Furniture cannot be placed on wall tiles, but background rows may overlap walls.

**Furniture**: Ghost preview (green/red validity). R key rotates, T key toggles on/off state. Drag-to-move in SELECT. Delete button (red X) + rotate button (blue arrow) on selected items. Any selected furniture shows HSBC color sliders (Color toggle + Clear button); color stored per-item in `PlacedFurniture.color?`. Single undo entry per color-editing session (tracked by `colorEditUidRef`). Pick tool copies type+color from placed item. Surface items preferred when clicking stacked furniture.

**Undo/Redo**: 50-level, Ctrl+Z/Y. EditActionBar (top-center when dirty): Undo, Redo, Save, Reset.

**Multi-stage Esc**: exit furniture pick → deselect catalog → close tool tab → deselect furniture → close editor.

**Erase tool**: Sets tiles to `TileType.VOID` (transparent, non-walkable, no furniture). Right-click in floor/wall/erase tools also erases to VOID (drag-erasing supported). Context menu suppressed in edit mode.

**Grid expansion**: In floor/wall/erase tools, a ghost border (dashed outline) appears 1 tile outside the grid. Clicking a ghost tile calls `expandLayout()` to grow the grid by 1 tile in that direction. New tiles are VOID. Furniture positions and character positions shift when expanding left/up. Max: `MAX_COLS`×`MAX_ROWS` (64×64). Default: `DEFAULT_COLS`×`DEFAULT_ROWS` (20×11). Characters outside bounds after resize relocated to random walkable tiles.

**Layout model**: `{ version: 1, cols, rows, tiles: TileType[], furniture: PlacedFurniture[], tileColors?: ColorValue[] }`. Grid dimensions are dynamic. Persisted via debounced saveLayout message → `writeLayoutToFile()` → `~/.claude-office/layout.json`. Export/Import in Settings run entirely in the browser (download / file picker), not through the protocol.

## Asset System

**Loading**: `esbuild.js` copies `webview-ui/public/assets/` → `dist/assets/`. Loader checks bundled path first, falls back to workspace root. PNG → pngjs → SpriteData (2D hex array, alpha≥2 = visible, `#RRGGBBAA` for semi-transparent). `loadDefaultLayout()` reads `assets/default-layout.json` as fallback for new installs.

**Catalog**: `furniture-catalog.json` with `id, name, label, category, footprint, isDesk, canPlaceOnWalls, groupId?, orientation?, state?, canPlaceOnSurfaces?, backgroundTiles?`. String-based type system. Categories: desks, chairs, storage, electronics, decor, wall, misc. Wall-placeable items use the `wall` category and appear in a dedicated "Wall" tab. Asset naming convention: `{BASE}[_{ORIENTATION}][_{STATE}]` (e.g., `MONITOR_FRONT_OFF`).

**Per-furniture manifests**: Each furniture item lives in its own folder under `assets/furniture/` with a `manifest.json` that declares its sprites, rotation groups, state groups (on/off), and animation frames. Floor tiles are individual PNGs in `assets/floors/`; wall tile sets in `assets/walls/`.

**Rotation groups**: `buildDynamicCatalog()` builds `rotationGroups` Map from assets sharing a `groupId`. Supports 2+ orientations (e.g., front/back only). Editor palette shows 1 item per group (front orientation preferred). `getRotatedType()` cycles through available orientations.

**State groups**: Items with `state: "on"` / `"off"` sharing the same `groupId` + `orientation` form toggle pairs. `stateGroups` Map enables `getToggledType()` lookup. Editor palette hides on-state variants. State groups are mirrored across orientations.

**Auto-state**: `officeState.rebuildFurnitureInstances()` swaps electronics to ON sprites when an active agent faces a desk with that item nearby (3 tiles deep in facing direction, 1 tile to each side). Operates at render time without modifying the saved layout.

**Background tiles**: `backgroundTiles?: number` — top N footprint rows allow other furniture to be placed on them AND characters to walk through. Z-sort places bg-row items behind the host furniture.

**Surface placement**: `canPlaceOnSurfaces?: boolean` — items like laptops, monitors, mugs can overlap with all tiles of `isDesk` furniture. `canPlaceFurniture()` builds a desk-tile set and excludes it from collision checks. Z-sort: surface items get `zY = max(spriteBottom, deskZY + 0.5)`.

**Wall placement**: `canPlaceOnWalls?: boolean` — items like paintings, windows, clocks can only be placed on wall tiles. `canPlaceFurniture()` requires the bottom row of the footprint to be on wall tiles; upper rows may extend above the map. `getWallPlacementRow()` offsets placement so the bottom row aligns with the hovered tile.

**Colorize module**: `colorize.ts` with two modes selected by `ColorValue.colorize?` flag. **Colorize mode** (Photoshop-style): grayscale → luminance → contrast → brightness → fixed HSL; always used for floor tiles. **Adjust mode** (default for furniture and character hue shifts): shifts original pixel HSL. `adjustSprite()` exported for character hue shifts. Cache keyed by arbitrary string (includes colorize flag).

**Floor tiles**: `floors.png` (112×16, 7 patterns). Cached by (pattern, h, s, b, c).

**Wall tiles**: `walls.png` (64×128, 4×4 grid of 16×32 pieces). 4-bit auto-tile bitmask (N=1, E=2, S=4, W=8). Sprites extend 16 px above tile (3D face). `wallTiles.ts` computes bitmask at render time. Colorizable via HSBC sliders. Wall sprites z-sorted with furniture/characters (`getWallInstances()` builds `FurnitureInstance[]`).

**Character sprites**: 6 pre-colored PNGs (`assets/characters/char_0.png`–`char_5.png`), one per palette. Each 112×96: 7 frames × 16 px wide, 3 direction rows × 32 px tall. Row 0 = down, Row 1 = up, Row 2 = right. Frame order: walk1, walk2, walk3, type1, type2, read1, read2. Left = flipped right at runtime. When `hueShift !== 0`, `hueShiftSprites()` applies `adjustSprite()` to all frames before caching.

**External directories**: `addExternalAssetDirectory` takes a typed absolute `path` (the browser has no native folder picker); the server validates it, persists it in `config.json` and re-broadcasts the merged sprites. See `docs/external-assets.md`.

**Load order**: `characterSpritesLoaded` → `floorTilesLoaded` → `wallTilesLoaded` → `furnitureAssetsLoaded` → `layoutLoaded`.

## Testing

Three tiers, each with its own framework. There is no CI: run them locally before pushing.

### Server unit/integration (Vitest)

`server/__tests__/` (28 files) covers the runtime, persistence, providers, HTTP/WebSocket server, CLI, diagnostics, asset reloads, and the e2e scenario runner. Representative suites:

| File                           | Coverage                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentStateStore.test.ts`      | Mutations, EventEmitter events, snapshot                                                                                                       |
| `agentRuntime.test.ts`         | Lifecycle, scanners, restore                                                                                                                   |
| `hookEventHandler.test.ts`     | Routing, buffering, normalized dispatch, team gating                                                                                           |
| `sessionRouter.test.ts`        | session_id mapping, pending sessions, buffer flush                                                                                             |
| `fileWatcherDismissal.test.ts` | DismissalTracker integration                                                                                                                   |
| `fileStateAdapter.test.ts`     | Namespaced persistence, allowlist, settings round-trip                                                                                         |
| `configPersistence.test.ts`    | `standalone` namespace, consent + hooksEnabled maps, external directories                                                                      |
| `backgroundAgents.test.ts`     | Sidecar classification, shadow store, teammate promotion                                                                                       |
| `contextUsage.test.ts`         | Snapshot semantics, sidechain latch, provider windows                                                                                          |
| `teamUtils.test.ts`            | Inline-teammate helpers                                                                                                                        |
| `claudeTeamProvider.test.ts`   | Discovery, membership, metadata extraction                                                                                                     |
| `claude.test.ts`               | `normalizeHookEvent` per Claude event, file fallback                                                                                           |
| `claudeHookInstaller.test.ts`  | Atomic install/uninstall, unparseable-file + non-array abort, throwing writes, mode preservation, backup, hook identity, event-scope migration |
| `consentFlow.test.ts`          | In-app consent over the wire: who is asked, what each answer writes, Back-and-revise semantics, answer serialization                           |
| `claude-office-hook.test.ts`   | Spawned hook script integration (needs `dist/hooks/claude-office-hook.js`)                                                                     |
| `cli.test.ts`                  | `parseArgs` (port/host/token/env), token validation, spawned CLI with and without Bearer                                                       |
| `server.test.ts`               | HTTP lifecycle, auth, `/ws`, broadcast, reuse of a running server, registry pruning                                                            |
| `httpServerWs.test.ts`         | `/ws` gate: same-origin handshake, `?token=` privilege                                                                                         |
| `mockClaudeRunner.test.ts`     | E2E scenario runner sanity                                                                                                                     |

Run: `npm run test:server` (or `npm test` for all three tiers). Known environment quirk: "rejects when the .claude directory is not writable" (`claudeHookInstaller.test.ts`) fails when the suite runs as root, because root ignores file modes; it is skipped on Windows and passes as a normal user.

### Webview unit (Vitest, Node runner)

`webview-ui/test/` (10 files) covers office state, layout serialization, teammate seating, pets, the Intro reducer and Vite/browser wiring. Run: `npm run test:webview`.

### Package contract (node --test)

`scripts/npm-package-contract.test.mjs` pins the package name, repository URL and required tarball files. Run: `npm run test:package-contract`. `npm run verify:npm-package` additionally packs, installs the tarball into a temp project and smoke-tests the CLI (`--help`, `/api/health`, SPA, assets, hooks).

### End-to-end (Playwright)

`e2e/tests/standalone/` holds 10 tests (`@area:standalone`) against the real `dist/cli.js`: each test spawns the server with an isolated `HOME` and workspace, opens the printed URL in Playwright's Chromium and drives the public seams — the hook endpoint, the SPA and the files written under `HOME`. Build first (`npm run build`); Playwright downloads its Chromium on first use (`npx playwright install chromium`). The generated [e2e inventory](e2e/README.md) is the source of truth for current specs and the normative **test model & rules**; read it before adding a spec.

**Mock claude**: tests never invoke real `claude`. `e2e/fixtures/mock-claude-runner.cjs` honors `claudeScenario(...).at(ms).appendJsonl(record).emitHook(event).holdOpenFor(ms).build()` to drive timed JSONL writes and hook events from a separate process.

**Isolation**: each test gets its own `tmpHome`, workspace directory and mock-log file. No state leaks between tests.

**Inventory**: `e2e/README.md` contains an auto-generated section spliced between `<!-- BEGIN:E2E-INVENTORY -->` and `<!-- END:E2E-INVENTORY -->` markers. After adding or removing tests run `npm run e2e:inventory` and commit the result (nothing else regenerates it).

```bash
npm run e2e                                    # all tests
npm run e2e -- --grep "consent"                # filter by name
npm run e2e:debug                              # step-through
npm run e2e -- --attach-videos-on-success      # keep videos for passes too
npm run e2e:inventory                          # regen e2e/README.md inventory
npm run test:report                            # build combined Allure report
npm run test:report:open                       # serve Allure locally (file:// can't fetch)
```

## Build & Dev

**npm workspaces monorepo** (`server`, `webview-ui`). A single `npm install` at the root installs deps for all workspaces.

```bash
npm install                # installs root + workspaces in one shot
npm run build              # asyncapi:generate, check-types, lint, esbuild, vite  (alias: compile)
npm run package            # production build (esbuild --production)
npm start -- --port 3100   # node dist/cli.js --port 3100
npm test                   # webview + server vitest + package contract
npm run e2e                # Playwright
npm run format             # prettier --write
npm run knip               # unused files/exports/dependencies
```

`esbuild.js` runs two bundles plus an asset copy:

1. **CLI** (`dist/cli.js`) from `server/src/cli.ts`. Externals pulled at install time (`fastify`, `@fastify/*`).
2. **Hook script** (`dist/hooks/claude-office-hook.js`) from `server/src/providers/hook/claude/hooks/claude-office-hook.ts`. CJS, shebang.
3. `copyAssets()`: `webview-ui/public/assets/` → `dist/assets/`.

`define: { 'process.env.CLAUDE_OFFICE_VERSION': JSON.stringify(version) }` stamps the package version into both bundles.

**Watch mode**:

```bash
npm run watch                       # parallel esbuild watch + tsc --noEmit watch
npm run dev -w webview-ui           # Vite dev server with browserMock (no server needed)
```

The webview Vite dev server is **not** included in `npm run watch`; after webview changes run `npm run build:webview` or the full build.

**Pre-commit** (husky + lint-staged): `gitleaks protect --staged` when gitleaks is installed (skipped with a warning otherwise), then eslint/prettier on staged files.

**Checks before pushing** (what CI used to run): `npm run lint`, `npm run check-types`, `npm run asyncapi:validate`, `npm run build` (regenerates `core/src/messages.ts` — commit any diff), `npm run e2e:inventory` (commit any diff), `npm test`, `npm run e2e`.

## TypeScript Constraints

- **No `enum`** (`erasableSyntaxOnly` in webview) — use `as const` objects (`TileType`, `CharacterState`, `Direction`, `EditTool`).
- **`import type`** required for type-only imports (`verbatimModuleSyntax` in webview; convention in server).
- **`noUnusedLocals` / `noUnusedParameters`** — strict everywhere.
- **`.js` extensions** on all relative imports in server + core (Node16 module resolution).
- **Module Node16, target ES2022** in server/core. **`erasableSyntaxOnly`, `verbatimModuleSyntax`, `noFallthroughCasesInSwitch`** in the webview.

## Constants Policy

All magic numbers and strings are centralized — never inline:

| Where                                           | What lives there                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `server/src/constants.ts`                       | Timing/scanning constants (`PERMISSION_TIMER_DELAY_MS`, `TEXT_IDLE_DELAY_MS`, scanner intervals), `TOKEN_ENV_VAR`, `MIN_AUTH_TOKEN_LENGTH` |
| `server/src/providers/hook/claude/constants.ts` | Claude hook event names, hook script name/dir, settings backup suffix                                                                      |
| `core/src/constants.ts`                         | Protocol-level constants (e.g., transport state names)                                                                                     |
| `webview-ui/src/constants.ts`                   | Webview magic numbers (grid, animation, rendering, camera, zoom, editor, game logic) + canvas overlay rgba strings                         |
| `webview-ui/src/index.css` `:root`              | CSS custom properties (`--pixel-bg`, `--pixel-border`, `--pixel-accent`, ...) for React inline styles and CSS                              |
| `webview-ui/src/office/types.ts`                | Re-exports grid constants from `constants.ts` for convenience                                                                              |

## Error Handling

- **Try-catch with graceful degradation** — errors logged but never crash the server.
- **Malformed JSONL lines** silently ignored (catch block in `processTranscriptLine`).
- **Missing assets** logged with warning, operation continues with null/fallback.
- A hook POST that fails never blocks Claude Code (non-2xx is a non-blocking hook error on its side).
- No centralized error reporting or telemetry.

## Logging

Use `console.log`/`error`/`warn` with prefixed context: server `[Claude Office]`, asset loading `[AssetLoader]`, browser `[Webview]`, `[Transport]`, `[BrowserMock]`. Fastify's request logger is off (`logger: false`), so the tokened URL never lands in a server log.

## Condensed Lessons

- `fs.watch` unreliable on Windows — always pair with polling backup.
- Partial line buffering essential for append-only file reads (carry unterminated lines).
- Delay `agentToolDone` 300 ms to prevent React batching from hiding brief active states.
- **Idle detection** has two signals: (1) `system` + `subtype: "turn_duration"` — reliable for tool-using turns (~98%), emitted once per completed turn. (2) Text-idle timer (`TEXT_IDLE_DELAY_MS = 5 s`) — for text-only turns. Only starts when `hadToolsInTurn` is false; suppressed once `hadToolsInTurn` becomes true. Reset on new user prompt or `turn_duration`. Cancelled by ANY new JSONL data.
- User prompt `content` can be string (text) or array (tool_results) — handle both.
- `/clear` creates a NEW JSONL file (old file just stops).
- Hook-based IPC through env vars failed in early upstream prototypes (hooks captured at startup, env vars don't propagate). HTTP `/api/hooks/:providerId` with `~/.claude-office/server.json` + `servers/` discovery works.
- PNG→SpriteData: pngjs for RGBA buffer, alpha threshold 2 (`PNG_ALPHA_THRESHOLD`), supports `#RRGGBBAA` semi-transparent pixels.
- OfficeCanvas selection changes are imperative (`editorState.selectedFurnitureUid`); must call `onEditorSelectionChange()` to trigger React re-render for toolbar.
- **External-session adoption**: scanner runs every 3 s. In hooks-OFF scenarios the test setup can race the first scanner tick. Mock-claude scenarios should give a few seconds of margin before assertions.
- **Heuristic sub-agent permission bubble timing**: the bubble lands 7 s after the SUB-TOOL is registered, not 7 s after the parent Task tool appears. Tests waiting on it from the "Subtask:" overlay need at least `1 s (Task→Bash gap) + 7 s timer + ~300 ms IPC/render = 9–10 s` budget.
- **runInBackground sub-character gate**: in webview `agentToolStart`, `runInBackground=true` Agent tools are gated out of sub-character creation when the parent has a `teamName` (teammate path handles it). With no `teamName`, the gate must be bypassed so the basic Subtask sub-character still renders. `addSubagent` dedups via `subagentIdMap`, so the bypass is safe even if a teammate is detected later. `subagentToolStart` creates the sub lazily when it's missing — covering teamed leads' unnamed background spawns and post-reload recreation.
- **Allure HTML report**: viewing via `file://` fails (browsers block `fetch()` from local files). Use `npx allure open allure-report/allure` or `npm run test:report:open`.
- **Context usage is a snapshot against a provider-declared window**, and both halves are easy to get wrong: cumulative sums measure spend rather than occupancy, `input_tokens` without the cache counters measures almost nothing, and a 200k window assumed for a 1M model reads five times too full (the number to check it against is Claude Code's own statusline `context_window.used_percentage`).
- **Playwright version vs. preinstalled browsers**: `@playwright/test` wants the Chromium revision it was released with. On a machine with a different preinstalled revision, point `launchOptions.executablePath` at it from a local config override instead of downgrading the package.
- **Killing the server from a script**: `pkill -f dist/cli.js` matches the shell that runs it too. Kill by PID (`~/.claude-office/server.json` carries it).

## Manual Hook Testing

`server/manual-hook-events.http` (REST-Client format) drives the local hook server. Start `node dist/cli.js --port 3100`, copy `port` and `token` from `~/.claude-office/server.json`, set `cwd` to the folder the server was started from (or enable **Watch All Sessions**). Covers `SessionStart` → `PreToolUse` → `PermissionRequest`/`Notification`/`Stop` → `SessionEnd`. The same requests, with a fixed token, verify a native `http` hook setup (`docs/remote-hooks.md`).

## Asset Tools

`scripts/asset-manager.html` (furniture manifest editor, Save/Save As via File System Access API), `scripts/wall-tile-editor.html` (wall sprite editing) and `scripts/jsonl-viewer.html` (transcript inspector) open directly in a browser.

## Key Decisions

Fork-level (taken with the owner, recorded in `docs/PLAN.md`):

- **Web only, deep clean.** The VS Code adapter went away together with everything that existed only for it: terminal adoption, the IDE-only protocol messages, the `vscode` config namespace, legacy state migration, VSIX packaging, Vercel staging, GitHub workflows and templates, and the VS Code e2e suite. The office observes; it never launches agents. A web terminal is phase 2.
- **100% Claude.** No other CLIs. Claude Code locally first; cloud sessions and Agent SDK agents arrive through the same hook ingress with a fixed token.
- **Renamed end to end**: package and command `claude-office`, state dir `~/.claude-office/`, hook script `claude-office-hook.js`, env vars `CLAUDE_OFFICE_*`, ESLint rule prefix `claude-office/`. No legacy hook-name support: the installer recognizes only its own suffix, so stale `pixel-agents` entries are left untouched for the user to remove.
- **No CI for now.** Husky + lint-staged on commit (gitleaks optional); the former CI checklist is run by hand before pushing.
- **Fixed token** (`--token` / `CLAUDE_OFFICE_TOKEN`, validated) so native `http` hooks can be configured once; random per start otherwise.
- **Upstream stays mergeable.** Full pixel-agents history kept; `git remote add upstream https://github.com/pixel-agents-hq/pixel-agents` and merge, keeping fork changes small and isolated.
- **Hosting undecided** for phase 2; the plan assumes generic Docker behind a TLS proxy.

Inherited from upstream and still true:

- **Layered codebase** (core → server; core → webview-ui).
- **AsyncAPI 3.0 contract**, generated TS bindings. Single source of truth for the wire protocol.
- **AgentRuntime** lifecycle core; **AgentStateStore** as single source of truth with typed mutations and typed events. No transport calls outside the broadcast layer.
- **Transport abstraction**: `MessageTransport` interface with one implementation (`WebSocketTransport`).
- **HookProvider** as the integration boundary, with optional file fallback. **TeamProvider** as optional extension; Claude Agent Teams is the only implementation.
- **`erasableSyntaxOnly`** in webview forbids `enum` — use `as const` objects.
- **Server always starts** regardless of hooks toggle. Only hook installation is gated by the setting.
- **Consent before any FIRST settings-file write**, per provider (`hooksConsent: {providerId: 'granted'|'declined'}`, absent = unanswered; the `hooksEnabled` preference beside it is per-provider and machine-global). **Exactly one population is asked: the one with nothing of ours installed** — hooks already on disk are granted silently at startup, since that install only ever removes events. The ask is one step of the Intro, the four-step first-run tour a greeter character speaks in-app (`IntroBubble.tsx`); the server sends `hooksConsentRequest` during the `webviewReady` handshake, one per provider, privileged connections only, carrying the provider's own `consentDisclosure()` so no client-side copy can drift. The ask-or-not predicate, the choice→action rule, and the execution live ONCE in `server/src/providers/hook/` (`consentGate.ts` decides, `consentExecutor.ts` performs). **A choice is an absolute state command, not an event** — Back re-opens the ask, so a revision undoes whatever the earlier answer left: hooks on disk, a grant a failed install recorded, or a decline's own persisted hooks-off. That is why the consent record is a tri-state and each answer commits in ONE config write; the full rule and its rejected alternatives are `docs/adr/0001`. An abort (close x, Escape) sends nothing and the whole Intro returns next open; the closing step reports the install OUTCOME, not the click.
- **`hooksStatus` is install state, `hooksEnabled` is preference.** The Settings checkbox binds to `hooksInstalled` and toggles the _displayed_ state with no optimistic local update, so it can't read "on" over an untouched settings.json and lands correct rather than flickering when an install fails. Every failure path re-derives and broadcasts the truth (`clientMessageHandler`). The hook script is copied BEFORE the entries are written; a failed copy aborts the install (entries pointing at a missing script spawn a dead `node` per event). **Hooks-off is persisted only AFTER a successful uninstall** — flipping it first strands the user: the entries keep firing while the persisted preference makes the next start skip the gate entirely.
- **Never rewrite a shape we did not author.** The unparseable-file abort generalizes: a non-object `hooks`, a non-array `hooks.<Event>`, and junk entries inside an event array are all refused or passed through, never replaced. An array `hooks` was the sharp case — string keys assigned onto it vanish from `JSON.stringify`, so the write committed and reported `installed: true` over a file with no hooks in it. Emptied event keys are deleted only when _our_ removal emptied them. **Internal sentinels must not be values user JSON can hold**: `null` marked "this entry is now empty", so a user-authored `null` inside a hooks array was silently deleted — it is a `Symbol` now.
- **Hook identity is anchored at both ends, not a substring.** `includes('claude-office-hook.js') && includes('.claude-office')` would claim — and `uninstallHooks` would then DELETE — a `.backup` copy of our script, a shell comment naming our path, a wrapper passing it as an argument, `/opt/evil.claude-office/hooks/claude-office-hook.js`, and `my-claude-office-hook.js`. Ours = the `/.claude-office/hooks/claude-office-hook.js` suffix, ending the command's FIRST token, matched **case-insensitively** (the token is normalized to lower case). On the case-insensitive volumes this runs on (macOS, Windows) a differently-cased path is the SAME INODE as our script and genuinely firing: case-sensitive matching made reinstall append a duplicate and uninstall leave the cased entry as an orphan `areHooksInstalled` could no longer see — a live hook with no removal route. The folding is unconditional (no filesystem case-sensitivity probe), so the accepted trade is a Linux-only false positive that is **not** a mere dedup: on a case-sensitive volume `~/.Claude-Office/hooks/claude-office-hook.js` is a genuinely DIFFERENT file, we classify it as ours, and uninstall **deletes** it (`claudeHookInstaller.test.ts` pins that removal). Nothing creates that path, and the trade is deliberate. A symlink alias to our script is deliberately _not_ recognized — the cost is one duplicate entry, versus deleting a stranger's hook if we resolved paths.
- **E2E over webview unit tests**: e2e pins user-facing behavior, which is stable across internal refactors.

## Project Identity

- npm package: `claude-office` (private, not published; CLI bin `claude-office`)
- GitHub: `https://github.com/andresgmg/claude-office` (fork of `https://github.com/pixel-agents-hq/pixel-agents`)
- State directory: `~/.claude-office/`; env vars: `CLAUDE_OFFICE_TOKEN`, `CLAUDE_OFFICE_VERSION` (build-time define)
- License: MIT (upstream copyright preserved in `LICENSE`)
