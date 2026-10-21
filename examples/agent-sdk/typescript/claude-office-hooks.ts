/**
 * Claude Office forwarder for the Claude Agent SDK (TypeScript).
 *
 * Posts the hook events of an SDK session to a Claude Office server — the same
 * JSON Claude Code hands its own hooks — so the agent appears in the office
 * like any Claude Code session.
 *
 * You only need this when the SDK program runs on a machine other than the
 * office's, or with `settingSources: []`. On the office's own machine the SDK
 * loads `~/.claude/settings.json` by default, so the hooks the office installed
 * there already fire for SDK sessions and nothing has to be added. Never run
 * both on the same machine: every event would arrive twice.
 *
 * Usage:
 *
 *   import { query } from '@anthropic-ai/claude-agent-sdk';
 *   import { claudeOfficeHooks } from './claude-office-hooks.js';
 *
 *   for await (const message of query({
 *     prompt: 'Run the tests and fix what fails',
 *     options: { hooks: claudeOfficeHooks() },
 *   })) {
 *     // ...
 *   }
 *
 * Configuration (arguments win over environment variables):
 *   CLAUDE_OFFICE_URL    base URL of the office, default http://127.0.0.1:3100
 *   CLAUDE_OFFICE_TOKEN  the token the server was started with (--token)
 *
 * Requires Node 18+ (global fetch, AbortSignal.timeout) and
 * `npm install @anthropic-ai/claude-agent-sdk`.
 */

import type { HookCallback, HookCallbackMatcher, HookEvent } from '@anthropic-ai/claude-agent-sdk';

export interface ClaudeOfficeHooksOptions {
  /** Base URL of the office server, e.g. `https://oficina.example.com`. */
  url?: string;
  /** Bearer token the server was started with. */
  token?: string;
  /** Per-request timeout in ms. A slow or stopped office must never slow the agent. */
  timeoutMs?: number;
  /** Events to forward. Default: the twelve the office installs for Claude Code. */
  events?: HookEvent[];
}

/** The events the office installs for Claude Code; the TypeScript SDK exposes all of them. */
export const CLAUDE_OFFICE_EVENTS: HookEvent[] = [
  'SessionStart',
  'SessionEnd',
  'Stop',
  'PermissionRequest',
  'Notification',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'SubagentStart',
  'SubagentStop',
  'TeammateIdle',
  'TaskCompleted',
];

const DEFAULT_URL = 'http://127.0.0.1:3100';
const HOOK_PATH = '/api/hooks/claude';
const DEFAULT_TIMEOUT_MS = 1500;
/** Longest string kept inside tool_input: the office only needs the gist, and
 *  its hook endpoint caps bodies at 64 KB (a Write carries the whole file). */
const MAX_STRING_LENGTH = 2000;
/** The fields the office reads. Everything else (tool responses, messages,
 *  background task lists) is dropped before sending. */
const FORWARDED_KEYS = [
  'hook_event_name',
  'session_id',
  'transcript_path',
  'cwd',
  'permission_mode',
  'source',
  'reason',
  'tool_name',
  'tool_input',
  'tool_use_id',
  'notification_type',
  'agent_id',
  'agent_type',
  'teammate_name',
  'task_subject',
  'subject',
  'run_in_background',
  'stop_hook_active',
] as const;

function truncate(value: unknown): unknown {
  if (typeof value !== 'string' || value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}…`;
}

/** The subset of a hook input the office uses, with long strings cut short. */
export function pickForwardedFields(raw: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of FORWARDED_KEYS) {
    if (raw[key] === undefined) continue;
    if (key === 'tool_input' && typeof raw[key] === 'object' && raw[key] !== null) {
      const input: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw[key] as Record<string, unknown>)) {
        input[k] = truncate(v);
      }
      payload[key] = input;
    } else {
      payload[key] = raw[key];
    }
  }
  return payload;
}

export interface ClaudeOfficeForwarder {
  /** The hook callback; register it under every event you want forwarded. */
  callback: HookCallback;
  /** Post a SessionEnd for every session still open. Call it when your program
   *  stops without a natural SessionEnd (for example on SIGINT). */
  close: () => Promise<void>;
}

export function createClaudeOfficeForwarder(
  options: ClaudeOfficeHooksOptions = {},
): ClaudeOfficeForwarder {
  const base = (options.url ?? process.env.CLAUDE_OFFICE_URL ?? DEFAULT_URL).replace(/\/+$/, '');
  const url = base + HOOK_PATH;
  const token = options.token ?? process.env.CLAUDE_OFFICE_TOKEN;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const openSessions = new Set<string>();

  if (!token) {
    console.warn('[claude-office] CLAUDE_OFFICE_TOKEN is not set: the office will answer 401');
  }

  async function post(payload: Record<string, unknown>): Promise<void> {
    const event = String(payload.hook_event_name);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        console.warn(`[claude-office] ${event} rejected: HTTP ${response.status}`);
      }
    } catch (err) {
      // A hook must never fail the agent: log and move on.
      console.warn(
        `[claude-office] ${event} not delivered: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // `input: unknown` rather than the SDK's HookInput so the file also compiles
  // before the SDK is installed; a narrower parameter would be assignable too.
  const callback: HookCallback = async (input: unknown) => {
    const raw = input as Record<string, unknown>;
    const sessionId = typeof raw.session_id === 'string' ? raw.session_id : undefined;
    const eventName = raw.hook_event_name;

    // The office stages a session on SessionStart and draws the character on
    // the next event. A program that forwards a subset of events still gets a
    // character: the first event seen for a session is preceded by a
    // synthesized SessionStart.
    if (sessionId && !openSessions.has(sessionId)) {
      openSessions.add(sessionId);
      if (eventName !== 'SessionStart') {
        await post({
          hook_event_name: 'SessionStart',
          session_id: sessionId,
          source: 'startup',
          cwd: raw.cwd,
          transcript_path: raw.transcript_path,
        });
      }
    }
    if (eventName === 'SessionEnd' && sessionId) openSessions.delete(sessionId);

    await post(pickForwardedFields(raw));
    return {};
  };

  async function close(): Promise<void> {
    for (const sessionId of openSessions) {
      await post({ hook_event_name: 'SessionEnd', session_id: sessionId, reason: 'exit' });
    }
    openSessions.clear();
  }

  return { callback, close };
}

/**
 * The `hooks` option for `query()` / `ClaudeSDKClient`: every office event
 * routed to one forwarder. Pass the result as `options.hooks` (merge it with
 * your own hooks if you have any).
 */
export function claudeOfficeHooks(
  options: ClaudeOfficeHooksOptions = {},
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const forwarder = createClaudeOfficeForwarder(options);
  const hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {};
  for (const event of options.events ?? CLAUDE_OFFICE_EVENTS) {
    hooks[event] = [{ hooks: [forwarder.callback] }];
  }
  return hooks;
}
