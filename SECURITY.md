# Security Policy

Claude Office is a private fork of [pixel-agents](https://github.com/pixel-agents-hq/pixel-agents). It runs a local HTTP/WebSocket server that receives Claude Code hook events and edits the hook entries in `~/.claude/settings.json` with the user's consent.

## Supported Versions

| Version      | Supported          |
| ------------ | ------------------ |
| `main` (0.x) | :white_check_mark: |
| pixel-agents | see upstream       |

## Reporting a Vulnerability

Report issues privately to the repository owner (open a private issue in this repository, or use GitHub's private vulnerability reporting if it is enabled). Do not include tokens, the printed `?token=` URL or the contents of `~/.claude/settings.json` in the report.

If the issue also affects pixel-agents, report it upstream as well through [their private vulnerability reporting](https://github.com/pixel-agents-hq/pixel-agents/security/advisories/new).

## Scope

- Forging or replaying hook events, or bypassing the bearer token on `POST /api/hooks/:providerId` or on the privileged `/ws` messages (hook install/uninstall, consent).
- Arbitrary file read or write beyond `~/.claude-office/` and the hook entries Claude Office writes in `~/.claude/settings.json`.
- Command execution through hook payloads, transcript (JSONL) parsing or external asset directories.
- Cross-site scripting in the web UI.
- Sensitive data exposure: session content, transcript paths, tokens in logs or URLs.

## Threat Model Notes

- The token is a bearer capability: whoever holds it can inject events and approve the hook install. It is random per start unless pinned with `--token` / `CLAUDE_OFFICE_TOKEN` (at least 16 characters, no whitespace).
- The server binds to `127.0.0.1` by default and speaks plain HTTP. Exposing it (`--host 0.0.0.0`) is only reasonable on a trusted network; the phase 2 deployment puts a TLS proxy in front of it (see `docs/PLAN.md`).
- The WebSocket same-origin check is deliberately weak (a DNS-rebound page passes it); privileges come from the token, never from a network position.
