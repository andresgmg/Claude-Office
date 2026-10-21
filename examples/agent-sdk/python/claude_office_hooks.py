"""Claude Office forwarder for the Claude Agent SDK (Python).

Posts the hook events of an SDK session to a Claude Office server, the same
JSON Claude Code hands its own hooks, so the agent appears in the office like
any Claude Code session.

You only need this when the SDK program runs on a machine other than the
office's, or with ``setting_sources=[]``. On the office's own machine the SDK
loads ``~/.claude/settings.json`` by default, so the hooks the office installed
there already fire for SDK sessions and nothing has to be added. Never run
both on the same machine: every event would arrive twice.

The Python SDK has no SessionStart / SessionEnd callbacks, so the forwarder
synthesizes them: a SessionStart before the first event of each session, and a
SessionEnd for every open session on ``close()`` (``async with`` does it for
you).

Usage::

    from claude_agent_sdk import ClaudeAgentOptions, query
    from claude_office_hooks import ClaudeOfficeForwarder

    async with ClaudeOfficeForwarder() as office:
        async for message in query(
            prompt="Run the tests and fix what fails",
            options=ClaudeAgentOptions(hooks=office.hooks()),
        ):
            ...

Configuration (arguments win over environment variables):
  CLAUDE_OFFICE_URL    base URL of the office, default http://127.0.0.1:3100
  CLAUDE_OFFICE_TOKEN  the token the server was started with (--token)

Requires ``pip install claude-agent-sdk`` (Python 3.10+); the HTTP client is
the standard library.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any

from claude_agent_sdk import HookMatcher

#: The office events the Python SDK exposes as callbacks. SessionStart,
#: SessionEnd, TeammateIdle and TaskCompleted are not available in Python;
#: the first two are synthesized below.
CLAUDE_OFFICE_EVENTS = (
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "Stop",
    "SubagentStart",
    "SubagentStop",
    "Notification",
    "PermissionRequest",
)

_DEFAULT_URL = "http://127.0.0.1:3100"
_HOOK_PATH = "/api/hooks/claude"
_DEFAULT_TIMEOUT_S = 1.5
#: Longest string kept inside tool_input: the office only needs the gist, and
#: its hook endpoint caps bodies at 64 KB (a Write carries the whole file).
_MAX_STRING_LENGTH = 2000
#: The fields the office reads. Everything else (tool responses, messages,
#: background task lists) is dropped before sending.
_FORWARDED_KEYS = (
    "hook_event_name",
    "session_id",
    "transcript_path",
    "cwd",
    "permission_mode",
    "source",
    "reason",
    "tool_name",
    "tool_input",
    "tool_use_id",
    "notification_type",
    "agent_id",
    "agent_type",
    "teammate_name",
    "task_subject",
    "subject",
    "run_in_background",
    "stop_hook_active",
)


def _truncate(value: Any) -> Any:
    if isinstance(value, str) and len(value) > _MAX_STRING_LENGTH:
        return value[:_MAX_STRING_LENGTH] + "…"
    return value


def pick_forwarded_fields(raw: dict[str, Any]) -> dict[str, Any]:
    """The subset of a hook input the office uses, with long strings cut short."""
    payload: dict[str, Any] = {}
    for key in _FORWARDED_KEYS:
        if key not in raw or raw[key] is None:
            continue
        if key == "tool_input" and isinstance(raw[key], dict):
            payload[key] = {k: _truncate(v) for k, v in raw[key].items()}
        else:
            payload[key] = raw[key]
    return payload


class ClaudeOfficeForwarder:
    """Forwards SDK hook events to a Claude Office server."""

    def __init__(
        self,
        url: str | None = None,
        token: str | None = None,
        timeout: float = _DEFAULT_TIMEOUT_S,
    ) -> None:
        base = (url or os.environ.get("CLAUDE_OFFICE_URL") or _DEFAULT_URL).rstrip("/")
        self._url = base + _HOOK_PATH
        self._token = token or os.environ.get("CLAUDE_OFFICE_TOKEN")
        self._timeout = timeout
        self._open_sessions: set[str] = set()
        if not self._token:
            print(
                "[claude-office] CLAUDE_OFFICE_TOKEN is not set: the office will answer 401",
                file=sys.stderr,
            )

    def hooks(self, events: tuple[str, ...] = CLAUDE_OFFICE_EVENTS) -> dict[str, list[HookMatcher]]:
        """The ``hooks`` value for ``ClaudeAgentOptions``: every event routed here."""
        return {event: [HookMatcher(hooks=[self.forward])] for event in events}

    async def forward(self, input_data: dict[str, Any], tool_use_id: str | None, context: Any) -> dict:
        """Hook callback: post the event, preceded by a synthesized SessionStart on first sight."""
        session_id = input_data.get("session_id")
        event_name = input_data.get("hook_event_name")
        if isinstance(session_id, str) and session_id not in self._open_sessions:
            self._open_sessions.add(session_id)
            if event_name != "SessionStart":
                await self._post(
                    {
                        "hook_event_name": "SessionStart",
                        "session_id": session_id,
                        "source": "startup",
                        "cwd": input_data.get("cwd"),
                        "transcript_path": input_data.get("transcript_path"),
                    }
                )
        if event_name == "SessionEnd" and isinstance(session_id, str):
            self._open_sessions.discard(session_id)
        await self._post(pick_forwarded_fields(input_data))
        return {}

    async def close(self) -> None:
        """Post a SessionEnd for every session still open."""
        for session_id in list(self._open_sessions):
            await self._post({"hook_event_name": "SessionEnd", "session_id": session_id, "reason": "exit"})
        self._open_sessions.clear()

    async def __aenter__(self) -> "ClaudeOfficeForwarder":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.close()

    async def _post(self, payload: dict[str, Any]) -> None:
        # urllib is blocking; keep the event loop (and the agent) free.
        await asyncio.to_thread(self._post_sync, payload)

    def _post_sync(self, payload: dict[str, Any]) -> None:
        event = str(payload.get("hook_event_name"))
        headers = {"Content-Type": "application/json"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        request = urllib.request.Request(
            self._url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST"
        )
        try:
            with urllib.request.urlopen(request, timeout=self._timeout) as response:
                if response.status >= 300:
                    print(f"[claude-office] {event} rejected: HTTP {response.status}", file=sys.stderr)
        except urllib.error.HTTPError as err:
            print(f"[claude-office] {event} rejected: HTTP {err.code}", file=sys.stderr)
        except (urllib.error.URLError, OSError) as err:
            # A hook must never fail the agent: log and move on.
            print(f"[claude-office] {event} not delivered: {err}", file=sys.stderr)
