/**
 * Minimal Agent SDK program whose session shows up in Claude Office.
 *
 *   npm install @anthropic-ai/claude-agent-sdk
 *   CLAUDE_OFFICE_URL=http://127.0.0.1:3100 CLAUDE_OFFICE_TOKEN=... npx tsx example.ts
 *
 * The forwarder is only needed when this program runs on a machine other than
 * the office's (see ../README.md).
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

import { CLAUDE_OFFICE_EVENTS, createClaudeOfficeForwarder } from './claude-office-hooks.js';

async function main(): Promise<void> {
  const office = createClaudeOfficeForwarder();
  const hooks = Object.fromEntries(
    CLAUDE_OFFICE_EVENTS.map((event) => [event, [{ hooks: [office.callback] }]]),
  );

  // Ctrl+C: tell the office the session is over before the process dies.
  process.once('SIGINT', () => {
    void office.close().finally(() => process.exit(130));
  });

  try {
    for await (const message of query({
      prompt: 'List the files in this directory and summarize what the project does.',
      options: { hooks },
    })) {
      if (message.type === 'result') {
        console.log(message.subtype === 'success' ? message.result : message.subtype);
      }
    }
  } finally {
    await office.close();
  }
}

void main();
