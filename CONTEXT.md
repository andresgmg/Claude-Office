# Claude Office

Claude Office turns AI coding sessions into animated characters in a pixel-art office. This glossary is the canonical language for contributors and integrators; end-user docs may simplify it but must never contradict it.

## Hosts & Adapters

**Host**:
The machine Claude Office runs on — a laptop, a phone, a VPS, a Raspberry Pi. The office is the same on every host, and can be reached from another device.
_Avoid_: platform, environment, server (that's the runtime process)

**Adapter**:
The integration that connects one host application to Claude Office. An adapter composes the runtime and the office UI, and binds them to that environment's storage and conventions. Standalone is the only adapter; the upstream project's VS Code adapter was removed in this fork.
_Avoid_: host (that's the machine it runs on), surface, flavor, platform, edition

**Standalone**:
The adapter that serves the office to a browser from a local server, independent of any editor. It observes sessions; it never launches them or attaches terminals.
_Avoid_: CLI (that's the entry command, not the adapter), browser mode

## Agents & Teams

**Agent**:
A Claude session tracked by Claude Office. Every agent is adopted: it was started outside the office, in a terminal, an IDE, the cloud or an Agent SDK program.
_Avoid_: bot, terminal (as a synonym), session (as a synonym)

**Headless agent**:
Upstream's term for an agent with no terminal to focus, optionally drawn translucent (a "ghost"). In Claude Office every agent is headless, since the office never launches or attaches terminals, so the term carries no information here and the ghost rendering was removed. Kept for upstream parity only.

**Character**:
The animated pixel-art figure representing an agent in the office. An agent has a status and a session; its character has a position and an animation state.
_Avoid_: avatar, sprite (a sprite is the image asset, not the figure)

**Sub-agent**:
An unnamed piece of delegated work spawned by an agent, visualized with its own character near its parent — around it, not in a seat. Not an Agent (no session of its own) and not a Teammate (no name). It exists only for the duration of its task, which may outlive the parent's turn. Having no name is what makes it a sub-agent.
_Avoid_: subtask (UI label prefix only)

**Team**:
A Lead plus the Teammates it spawned. A team exists because a teammate was spawned — whether or not the CLI recorded one. A CLI's team registry is evidence of a team, never its definition.

**Lead**:
The agent that spawned a Team's teammates. An agent becomes a lead the moment it spawns its first teammate.
_Avoid_: parent (that's the sub-agent relationship), orchestrator

**Teammate**:
A named agent spawned by another agent — the name is what makes it a teammate. Its spawner is its Lead, and together they form a Team. Every teammate has its own transcript and sits in a seat; it may or may not have its own session or terminal — how it runs never changes what it is.
_Avoid_: inline teammate, tmux teammate, session teammate (former run-style distinctions; a teammate's run style is a property, not an identity)

## Agent Lifecycle

**Launch**:
Start a new agent from the office. Not available in Claude Office, which only observes; the word is kept so it is never used for adoption.
_Avoid_: spawn (that's the character-level visual event), create

**Adopt**:
Begin tracking a session that was started outside the office. An adopted agent is a full citizen.
_Avoid_: import, attach

**Spawn / Despawn**:
The character-level visual event: a character materializing into or dissolving out of the office. An agent is launched or adopted; its character spawns.

**Dismiss**:
Remove an agent from the office by user choice, without judging its session. A dismissed session is not re-adopted.
_Avoid_: close, delete

**Orphaned**:
An agent whose transcript has been deleted, so the session it represents no longer exists. The office removes orphaned agents automatically.
_Avoid_: stale (implies inactivity or age, which never removes an agent), dead, ended

## Interaction

**Select**:
Mark a character as the current subject in the office (the white outline). Selection is what seat reassignment operates on, and what opens the Detail panel.
_Avoid_: focus (reserved for terminals), highlight

**Follow**:
The camera tracking the selected character. Ends on manual pan or deselection.
_Avoid_: track

**Detail panel**:
The side panel that opens for the selected character: project folder and git branch, working directory, model, context gauge, the newest tool call and its input, and the last message and prompt from the transcript. It follows the selection and closes with it. A selected sub-agent shows its parent's panel, since the sub has no session of its own.
_Avoid_: inspector, sidebar, properties

**Project label**:
The small line under a character's activity label: the folder the session runs in, then its git branch (`folder · branch`).
_Avoid_: workspace label, repo label

**Focus**:
Bring an agent's terminal to the front. Not available in Claude Office (there are no terminals); the word stays reserved so it is never used for the in-office highlight.

## First Run

**Intro**:
The four-step first-run tour the Greeter speaks: welcome, Claude Code, hooks consent, all set. The hooks consent ask is one step of it, not a separate dialog.
_Avoid_: onboarding, tutorial, wizard, consent modal

**Greeter**:
The character that speaks the Intro. Not an agent and not a Pet: it has no session, takes no seat, never wanders, and exists exactly as long as the Intro is open.
_Avoid_: mascot, tutorial character

## Agent Status

**Active**:
An agent that is executing its turn.
_Avoid_: busy, working, running

**Inactive**:
An agent that is not executing. Comes in exactly three forms: done, waiting for input, or permission request.
_Avoid_: waiting (the wire protocol's historical umbrella term), idle

**Done**:
The inactive form where the agent finished its turn and nothing is pending.

**Waiting for input**:
The inactive form where the agent asked the user something and is blocked on a reply.

**Permission request**:
The inactive form where the agent is blocked until the user approves a tool use. Unlike the other two forms, it can occur mid-turn.

**Activity label**:
The human-readable line describing what an agent is doing right now (e.g. "Reading foo.ts"), shown above its character.
_Avoid_: status text, tool status

**Speech bubble**:
The indicator above a character announcing a form of inactivity: "…" for a permission request (stays until resolved), a checkmark for a finished turn (fades on its own).
_Avoid_: bubble alone when ambiguous, notification

**Context gauge**:
The small bar under an agent's activity label showing how full its context window is. Every agent has one once it has taken a turn; sub-agents never do, having no session of their own. It reads the newest turn, so it falls when a session compacts or clears — it is a level, not a total.
_Avoid_: fuel gauge, health bar, token gauge (tokens are the unit, context is the thing)

## Office & Layout

**Office**:
The whole simulated world: the layout plus its inhabitants — characters and pets — and their live state.
_Avoid_: map, scene, room, level

**Layout**:
The office's spatial arrangement: the tile grid, floors, walls, carpets, areas, and furniture. It is the part of the office that the editor edits and that can be exported and shared.
_Avoid_: floor plan, blueprint, map

**Tile**:
One cell of the office grid.

**Floor**:
The walkable surface of a tile, painted with a pattern and color.

**Wall**:
A blocking tile that visually connects to adjacent walls.

**Carpet**:
A decorative layer painted over floor tiles.

**Area**:
A named region of tiles. Areas exist so project folders can be mapped to them.
_Avoid_: zone, region

**Area mapping**:
The assignment of a project folder (an agent's working directory) to one or more areas. Many folders may share an area. Agents adopted from a folder prefer seats inside any of its areas.

**Furniture**:
A placeable item in the layout — desks, chairs, storage, electronics, decor.
_Avoid_: object, prop, item

**Desk**:
Furniture that seats face and that hosts surface items. An agent's character sitting at its desk is the visual expression of being active.

**Seat**:
A sittable spot the office derives from chair furniture, assignable to exactly one agent.
_Avoid_: chair (that's the furniture), workstation

**Chair**:
The furniture category whose items create seats. Every footprint tile of a chair yields one seat.

**Seat assignment**:
Which agent owns which seat. Persisted, and changeable by selecting a character and clicking a free seat.

**Pet**:
An animated creature that lives in the office and belongs to no agent. Purely decorative; wanders like a character.
_Avoid_: mascot, animal

**Wander**:
The stroll a character takes away from its seat while its agent is done. Characters whose agents are waiting for input or awaiting a permission stay seated.
_Avoid_: roam, patrol

## Activity Detection

**Hook**:
A push notification an AI tool sends about its own session activity, delivered to Claude Office as it happens.

**Transcript**:
The append-only record of a session. Read in both detection modes for tool content.
_Avoid_: JSONL (Claude's file format, not the concept), log

**Hooks mode**:
The preferred detection mode, in which agent status is driven by hooks.

**Heuristic mode**:
The fallback detection mode, in which agent status is inferred from transcript activity, timers, and silence.
_Avoid_: file fallback, transcript mode, polling mode

## Integration Boundary

**Provider**:
The integration that connects one agent source to Claude Office. A provider normalizes raw activity into agent events and knows how to install that source's hooks. Claude Code is the only provider, and the fork stays Claude-only by decision; cloud sessions and Agent SDK agents feed the same provider through its hook endpoint rather than adding one.
_Avoid_: plugin, connector

**Agent event**:
The canonical, CLI-agnostic description of something happening in a session: a tool started, a turn ended, a teammate went idle. Providers produce agent events; everything downstream consumes only these, never CLI-specific names.
_Avoid_: hook event (the raw, CLI-specific payload before a provider normalizes it)

**Runtime**:
The adapter-independent core that tracks agents and drives the office. It is a separate thing from the adapters that compose it, the providers that feed it, and the office UI it serves.
_Avoid_: server, backend

**Transport**:
The channel carrying protocol messages between the office UI and the runtime. A WebSocket is the only transport today; the protocol is defined independently of the wire.
_Avoid_: connection, socket

**Protocol**:
The message contract between the office UI and the runtime, defined in a single source of truth (`core/asyncapi.yaml`).
_Avoid_: API
