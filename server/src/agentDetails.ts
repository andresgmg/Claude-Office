import * as fs from 'node:fs';

import type { HookProvider } from '../../core/src/provider.js';
import type { AgentStateStore } from './agentStateStore.js';
import {
  DETAILS_ASSISTANT_TEXT_MAX_LENGTH,
  DETAILS_TOOL_SUMMARY_MAX_LENGTH,
  DETAILS_USER_PROMPT_MAX_LENGTH,
} from './constants.js';
import { readGitBranch } from './gitBranch.js';
import type { AgentState } from './types.js';

/**
 * What the detail panel shows for an agent, and the project label's branch:
 * where the session runs (cwd + git branch), its newest tool call, and the last
 * things it said or was asked. Fed from both detection paths — hooks carry cwd
 * and tool calls, transcripts carry cwd, gitBranch, model and message text — and
 * broadcast as one `agentDetails` message whenever any of it changes.
 */

const ELLIPSIS = '…';

/** Collapse horizontal whitespace, trim, and cap the length with an ellipsis. */
export function truncateText(text: string, max: number): string {
  const collapsed = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (collapsed.length <= max) return collapsed;
  return collapsed.slice(0, Math.max(0, max - 1)).trimEnd() + ELLIPSIS;
}

function directoryExists(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Record the working directory a hook event or transcript record reported.
 * Returns true when it changed. The branch is read right away when the
 * directory exists on this machine.
 *
 * Locality is a heuristic: a remote session whose cwd happens to exist here
 * too would show this machine's branch. Hook payloads carry no host identity,
 * so there is nothing better to key on until phase 2 adds one.
 */
export function noteCwd(agent: AgentState, cwd: string | undefined): boolean {
  if (!cwd || cwd === agent.cwd) return false;
  agent.cwd = cwd;
  agent.cwdIsLocal = directoryExists(cwd);
  refreshGitBranch(agent);
  return true;
}

/**
 * Re-read the branch of the agent's cwd. `reported` is the branch a transcript
 * record carried at write time; it is the only source for a directory that is
 * not on this machine, and the fallback when the local read finds no repository.
 * Returns true when the branch changed.
 */
export function refreshGitBranch(agent: AgentState, reported?: string): boolean {
  const local = agent.cwd && agent.cwdIsLocal ? readGitBranch(agent.cwd) : undefined;
  const next = local ?? reported ?? agent.gitBranch;
  if (next === agent.gitBranch) return false;
  agent.gitBranch = next;
  return true;
}

/** Record the newest tool call with the provider's gist of its input. */
export function noteToolUse(
  agent: AgentState,
  toolName: string,
  input: unknown,
  provider: HookProvider | null | undefined,
  at = Date.now(),
): void {
  const raw = provider?.summarizeToolInput?.(toolName, input);
  const summary = raw ? truncateText(raw, DETAILS_TOOL_SUMMARY_MAX_LENGTH) : undefined;
  agent.lastTool = summary ? { name: toolName, summary, at } : { name: toolName, at };
  agent.lastActivityAt = at;
}

/** Record the newest assistant text. Returns true when it changed. */
export function noteAssistantText(agent: AgentState, text: string): boolean {
  const next = truncateText(text, DETAILS_ASSISTANT_TEXT_MAX_LENGTH);
  if (!next || next === agent.lastAssistantText) return false;
  agent.lastAssistantText = next;
  return true;
}

/** Record the newest user prompt. Returns true when it changed. */
export function noteUserPrompt(agent: AgentState, text: string): boolean {
  const next = truncateText(text, DETAILS_USER_PROMPT_MAX_LENGTH);
  if (!next || next === agent.lastUserPrompt) return false;
  agent.lastUserPrompt = next;
  return true;
}

/** Record the model of the newest assistant record. Returns true when it changed. */
export function noteModel(agent: AgentState, model: string): boolean {
  if (!model || model === '<synthetic>' || model === agent.model) return false;
  agent.model = model;
  return true;
}

/** The `agentDetails` message for one agent. Absent facts are left out rather than sent as null. */
export function buildAgentDetails(id: number, agent: AgentState): Record<string, unknown> {
  const msg: Record<string, unknown> = { type: 'agentDetails', id };
  if (agent.sessionId) msg.sessionId = agent.sessionId;
  if (agent.cwd) msg.cwd = agent.cwd;
  if (agent.gitBranch) msg.gitBranch = agent.gitBranch;
  if (agent.jsonlFile && !agent.hooksOnly) msg.transcriptPath = agent.jsonlFile;
  if (agent.model) msg.model = agent.model;
  if (agent.lastTool) msg.lastTool = { ...agent.lastTool };
  if (agent.lastAssistantText) msg.lastAssistantText = agent.lastAssistantText;
  if (agent.lastUserPrompt) msg.lastUserPrompt = agent.lastUserPrompt;
  const lastActivityAt = agent.lastActivityAt ?? (agent.lastDataAt || undefined);
  if (lastActivityAt) msg.lastActivityAt = lastActivityAt;
  return msg;
}

/** Broadcast the current details of one agent to every connected client. */
export function broadcastAgentDetails(store: AgentStateStore, id: number): void {
  const agent = store.get(id);
  if (!agent) return;
  store.broadcast(buildAgentDetails(id, agent));
}
