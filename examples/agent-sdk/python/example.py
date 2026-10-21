"""Minimal Agent SDK program whose session shows up in Claude Office.

    python -m venv .venv && source .venv/bin/activate   # Windows: .venv\\Scripts\\activate
    pip install claude-agent-sdk
    CLAUDE_OFFICE_URL=http://127.0.0.1:3100 CLAUDE_OFFICE_TOKEN=... python example.py

The forwarder is only needed when this program runs on a machine other than
the office's (see ../README.md).
"""

import asyncio

from claude_agent_sdk import ClaudeAgentOptions, ResultMessage, query

from claude_office_hooks import ClaudeOfficeForwarder


async def main() -> None:
    async with ClaudeOfficeForwarder() as office:
        async for message in query(
            prompt="List the files in this directory and summarize what the project does.",
            options=ClaudeAgentOptions(hooks=office.hooks()),
        ):
            if isinstance(message, ResultMessage):
                print(message.result or message.subtype)


if __name__ == "__main__":
    asyncio.run(main())
