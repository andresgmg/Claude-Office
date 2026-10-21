import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildAgentDetails,
  noteAssistantText,
  noteCwd,
  noteModel,
  noteToolUse,
  noteUserPrompt,
  refreshGitBranch,
  truncateText,
} from '../src/agentDetails.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { DETAILS_ASSISTANT_TEXT_MAX_LENGTH } from '../src/constants.js';
import { HookEventHandler } from '../src/hookEventHandler.js';
import { claudeProvider } from '../src/providers/hook/claude/claude.js';
import { SessionRouter } from '../src/sessionRouter.js';
import { processTranscriptLine, setHookProvider } from '../src/transcriptParser.js';
import type { AgentState } from '../src/types.js';

/** Minimal AgentState for testing (mirrors hookEventHandler.test.ts). */
function createTestAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 1,
    sessionId: 'sess-1',
    isExternal: true,
    projectDir: '/test',
    jsonlFile: '/test/session.jsonl',
    fileOffset: 0,
    lineBuffer: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    backgroundAgentToolIds: new Set(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    lastDataAt: 0,
    linesProcessed: 0,
    seenUnknownRecordTypes: new Set(),
    hookDelivered: false,
    contextTokens: 0,
    maxContextTokens: 200_000,
    ...overrides,
  } as AgentState;
}

/** A directory that cannot exist on this machine, standing in for a remote session's cwd. */
const REMOTE_CWD = path.join(os.tmpdir(), 'claude-office-not-here', `${process.pid}`, 'repo');

describe('agentDetails: text helpers', () => {
  it('truncateText collapses runs of spaces and tabs and caps with an ellipsis', () => {
    expect(truncateText('  a \t  b  ', 10)).toBe('a b');
    expect(truncateText('abcdefghij', 5)).toBe('abcd…');
    expect(truncateText('abcde', 5)).toBe('abcde');
  });

  it('noteAssistantText reports a change once and truncates long text', () => {
    const agent = createTestAgent();
    expect(noteAssistantText(agent, 'Hello there')).toBe(true);
    expect(noteAssistantText(agent, 'Hello there')).toBe(false);
    expect(noteAssistantText(agent, '')).toBe(false);
    const long = 'x'.repeat(DETAILS_ASSISTANT_TEXT_MAX_LENGTH + 50);
    expect(noteAssistantText(agent, long)).toBe(true);
    expect(agent.lastAssistantText?.length).toBe(DETAILS_ASSISTANT_TEXT_MAX_LENGTH);
    expect(agent.lastAssistantText?.endsWith('…')).toBe(true);
  });

  it('noteUserPrompt and noteModel ignore repeats and synthetic models', () => {
    const agent = createTestAgent();
    expect(noteUserPrompt(agent, 'fix the tests')).toBe(true);
    expect(noteUserPrompt(agent, 'fix the tests')).toBe(false);
    expect(noteModel(agent, 'claude-opus-5-5')).toBe(true);
    expect(noteModel(agent, 'claude-opus-5-5')).toBe(false);
    expect(noteModel(agent, '<synthetic>')).toBe(false);
    expect(agent.model).toBe('claude-opus-5-5');
  });
});

describe('agentDetails: tool gist via the Claude provider', () => {
  it('keeps the command, path, pattern or url of well-known tools', () => {
    const agent = createTestAgent();
    noteToolUse(agent, 'Bash', { command: 'npm test' }, claudeProvider, 1000);
    expect(agent.lastTool).toEqual({ name: 'Bash', summary: 'npm test', at: 1000 });
    noteToolUse(agent, 'Read', { file_path: '/repo/src/a.ts' }, claudeProvider, 1001);
    expect(agent.lastTool?.summary).toBe('/repo/src/a.ts');
    noteToolUse(agent, 'Grep', { pattern: 'TODO', path: 'src' }, claudeProvider, 1002);
    expect(agent.lastTool?.summary).toBe('TODO in src');
    noteToolUse(agent, 'WebFetch', { url: 'https://example.com' }, claudeProvider, 1003);
    expect(agent.lastTool?.summary).toBe('https://example.com');
    noteToolUse(
      agent,
      'Agent',
      { description: 'Research hooks', prompt: 'long' },
      claudeProvider,
      1004,
    );
    expect(agent.lastTool?.summary).toBe('Research hooks');
    expect(agent.lastActivityAt).toBe(1004);
  });

  it('falls back to the first string field, and to no summary at all', () => {
    const agent = createTestAgent();
    noteToolUse(agent, 'mcp__jira__search', { jql: 'project = X', limit: 5 }, claudeProvider, 1);
    expect(agent.lastTool?.summary).toBe('project = X');
    noteToolUse(agent, 'TodoWrite', { todos: [] }, claudeProvider, 2);
    expect(agent.lastTool).toEqual({ name: 'TodoWrite', at: 2 });
    noteToolUse(agent, 'Bash', { command: 'ls' }, null, 3);
    expect(agent.lastTool).toEqual({ name: 'Bash', at: 3 });
  });
});

describe('agentDetails: working directory and branch', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-office-details-'));
    fs.mkdirSync(path.join(root, '.git'));
    fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/develop\n');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('noteCwd records a local directory and reads its branch right away', () => {
    const agent = createTestAgent();
    expect(noteCwd(agent, root)).toBe(true);
    expect(agent.cwd).toBe(root);
    expect(agent.cwdIsLocal).toBe(true);
    expect(agent.gitBranch).toBe('develop');
    expect(noteCwd(agent, root)).toBe(false);
    expect(noteCwd(agent, undefined)).toBe(false);
    expect(noteCwd(agent, '')).toBe(false);
  });

  it('refreshGitBranch follows a local checkout switching branches', () => {
    const agent = createTestAgent();
    noteCwd(agent, root);
    expect(refreshGitBranch(agent)).toBe(false);
    fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    expect(refreshGitBranch(agent)).toBe(true);
    expect(agent.gitBranch).toBe('main');
  });

  it('a local read wins over the branch a transcript record reported', () => {
    const agent = createTestAgent();
    noteCwd(agent, root);
    expect(refreshGitBranch(agent, 'stale-from-transcript')).toBe(false);
    expect(agent.gitBranch).toBe('develop');
  });

  it('a remote working directory takes the branch the transcript reported', () => {
    const agent = createTestAgent();
    expect(noteCwd(agent, REMOTE_CWD)).toBe(true);
    expect(agent.cwdIsLocal).toBe(false);
    expect(agent.gitBranch).toBeUndefined();
    expect(refreshGitBranch(agent, 'cloud-branch')).toBe(true);
    expect(agent.gitBranch).toBe('cloud-branch');
    expect(refreshGitBranch(agent)).toBe(false);
    expect(agent.gitBranch).toBe('cloud-branch');
  });

  it('buildAgentDetails sends only what is known', () => {
    const agent = createTestAgent({ hooksOnly: true, jsonlFile: '' });
    expect(buildAgentDetails(1, agent)).toEqual({
      type: 'agentDetails',
      id: 1,
      sessionId: 'sess-1',
    });

    const full = createTestAgent({ lastDataAt: 777 });
    noteCwd(full, root);
    noteToolUse(full, 'Bash', { command: 'npm test' }, claudeProvider, 5);
    noteAssistantText(full, 'Done.');
    noteUserPrompt(full, 'run the tests');
    noteModel(full, 'claude-opus-5-5');
    expect(buildAgentDetails(1, full)).toEqual({
      type: 'agentDetails',
      id: 1,
      sessionId: 'sess-1',
      cwd: root,
      gitBranch: 'develop',
      transcriptPath: '/test/session.jsonl',
      model: 'claude-opus-5-5',
      lastTool: { name: 'Bash', summary: 'npm test', at: 5 },
      lastAssistantText: 'Done.',
      lastUserPrompt: 'run the tests',
      lastActivityAt: 5,
    });
  });
});

describe('agentDetails: broadcast from the hook path', () => {
  it('PreToolUse records cwd and the newest tool and broadcasts agentDetails', () => {
    const agents = new AgentStateStore();
    const messages: Array<Record<string, unknown>> = [];
    agents.on('broadcast', (msg) => {
      messages.push(msg);
    });
    const handler = new HookEventHandler(
      agents,
      new Map(),
      new Map(),
      claudeProvider,
      new SessionRouter(),
    );
    agents.set(1, createTestAgent({ id: 1 }));
    handler.registerAgent('sess-1', 1);

    handler.handleEvent('claude', {
      hook_event_name: 'PreToolUse',
      session_id: 'sess-1',
      cwd: REMOTE_CWD,
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    });

    const details = messages.filter((m) => m.type === 'agentDetails');
    expect(details.length).toBeGreaterThan(0);
    const last = details[details.length - 1];
    expect(last.cwd).toBe(REMOTE_CWD);
    expect(last.lastTool).toMatchObject({ name: 'Bash', summary: 'npm test' });
    expect(agents.get(1)?.cwd).toBe(REMOTE_CWD);
  });
});

describe('agentDetails: broadcast from transcript records', () => {
  let agents: AgentStateStore;
  let agent: AgentState;
  let messages: Array<Record<string, unknown>>;
  const waitingTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const permissionTimers = new Map<number, ReturnType<typeof setTimeout>>();

  beforeEach(() => {
    setHookProvider(claudeProvider);
    agents = new AgentStateStore();
    agent = createTestAgent({ hookDelivered: true });
    agents.set(1, agent);
    messages = [];
    agents.on('broadcast', (msg) => {
      messages.push(msg);
    });
    vi.useFakeTimers();
    return () => {
      vi.useRealTimers();
    };
  });

  const lastDetails = () => messages.filter((m) => m.type === 'agentDetails').at(-1);

  function line(record: Record<string, unknown>): string {
    return JSON.stringify({ cwd: REMOTE_CWD, gitBranch: 'cloud-branch', ...record });
  }

  it('assistant text, model, cwd and the reported branch reach the panel', () => {
    processTranscriptLine(
      1,
      line({
        type: 'assistant',
        message: {
          model: 'claude-opus-5-5',
          content: [{ type: 'text', text: 'Tests are green.' }],
        },
      }),
      agents,
      waitingTimers,
      permissionTimers,
    );
    expect(lastDetails()).toMatchObject({
      id: 1,
      cwd: REMOTE_CWD,
      gitBranch: 'cloud-branch',
      model: 'claude-opus-5-5',
      lastAssistantText: 'Tests are green.',
    });
  });

  it('a tool_use block records the newest tool', () => {
    processTranscriptLine(
      1,
      line({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: '/r/a.ts' } },
          ],
        },
      }),
      agents,
      waitingTimers,
      permissionTimers,
    );
    expect(lastDetails()?.lastTool).toMatchObject({ name: 'Read', summary: '/r/a.ts' });
  });

  it('user prompts are kept, tool results and meta records are not', () => {
    processTranscriptLine(
      1,
      line({ type: 'user', message: { content: 'please run the tests' } }),
      agents,
      waitingTimers,
      permissionTimers,
    );
    expect(lastDetails()?.lastUserPrompt).toBe('please run the tests');

    const before = messages.length;
    processTranscriptLine(
      1,
      line({
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }] },
      }),
      agents,
      waitingTimers,
      permissionTimers,
    );
    processTranscriptLine(
      1,
      line({
        type: 'user',
        isMeta: true,
        message: { content: '<command-name>/clear</command-name>' },
      }),
      agents,
      waitingTimers,
      permissionTimers,
    );
    expect(messages.slice(before).some((m) => m.type === 'agentDetails')).toBe(false);
    expect(agent.lastUserPrompt).toBe('please run the tests');
  });

  it('sidechain records never speak for the agent', () => {
    processTranscriptLine(
      1,
      line({
        type: 'assistant',
        isSidechain: true,
        message: {
          model: 'claude-haiku-5-5',
          content: [{ type: 'text', text: 'sub-agent chatter' }],
        },
      }),
      agents,
      waitingTimers,
      permissionTimers,
    );
    expect(agent.lastAssistantText).toBeUndefined();
    expect(agent.model).toBeUndefined();
    // cwd and branch are still taken from the record: they describe the session.
    expect(agent.cwd).toBe(REMOTE_CWD);
    expect(agent.gitBranch).toBe('cloud-branch');
  });
});
