import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PersistedAgent } from '../../core/src/schemas.js';

// Mock os.homedir() so the adapter resolves to an isolated temp dir on every
// platform. Overriding process.env.HOME is not portable: os.homedir() reads
// USERPROFILE on Windows, so a HOME-only override would still hit the real
// home directory.
let tempHome: string;
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, homedir: () => tempHome };
});

// Must import AFTER mock setup.
const { FileStateAdapter } = await import('../src/fileStateAdapter.js');
const { getHooksEnabled, setHooksEnabled } = await import('../src/configPersistence.js');

describe('FileStateAdapter', () => {
  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-adapter-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  // ── Settings (shared config.json, per-namespace section) ────

  it('returns defaults when config file does not exist', () => {
    const adapter = new FileStateAdapter({ namespace: 'standalone' });
    expect(adapter.getSetting('claude-office.soundEnabled', false)).toBe(true);
    expect(adapter.getSetting('claude-office.watchAllSessions', true)).toBe(false);
    expect(adapter.getSetting('claude-office.lastSeenVersion', 'x')).toBe('');
  });

  it('round-trips each namespaced setting key (hooksEnabled moved to the per-provider map)', () => {
    const adapter = new FileStateAdapter({ namespace: 'standalone' });

    adapter.setSetting('claude-office.soundEnabled', false);
    adapter.setSetting('claude-office.lastSeenVersion', '1.3');
    adapter.setSetting('claude-office.alwaysShowLabels', true);
    adapter.setSetting('claude-office.watchAllSessions', true);
    adapter.setSetting('claude-office.hooksInfoShown', true);

    expect(adapter.getSetting('claude-office.soundEnabled', true)).toBe(false);
    expect(adapter.getSetting('claude-office.lastSeenVersion', '')).toBe('1.3');
    expect(adapter.getSetting('claude-office.alwaysShowLabels', false)).toBe(true);
    expect(adapter.getSetting('claude-office.watchAllSessions', false)).toBe(true);
    expect(adapter.getSetting('claude-office.hooksInfoShown', false)).toBe(true);

    // hooksEnabled is deliberately NOT an adapter key any more: it is
    // per-provider and machine-global, so the adapter ignores it and the
    // per-provider accessors own it.
    adapter.setSetting('claude-office.hooksEnabled', false);
    expect(adapter.getSetting('claude-office.hooksEnabled', true)).toBe(true);
    setHooksEnabled('claude', false);
    expect(getHooksEnabled('claude')).toBe(false);
  });

  it('ignores unknown setting keys (returns default, does not write)', () => {
    const adapter = new FileStateAdapter({ namespace: 'standalone' });
    expect(adapter.getSetting('claude-office.unknownKey', 'fallback')).toBe('fallback');
    adapter.setSetting('claude-office.unknownKey', 'ignored');
    const configPath = path.join(tempHome, '.claude-office', 'config.json');
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it('accepts setting keys with or without the claude-office. prefix', () => {
    const adapter = new FileStateAdapter({ namespace: 'standalone' });
    adapter.setSetting('claude-office.soundEnabled', false);
    expect(adapter.getSetting('soundEnabled', true)).toBe(false);
    adapter.setSetting('lastSeenVersion', '1.0');
    expect(adapter.getSetting('claude-office.lastSeenVersion', '')).toBe('1.0');
  });

  it('persists settings under namespace in config.json with clean field names', () => {
    const adapter = new FileStateAdapter({ namespace: 'standalone' });
    adapter.setSetting('claude-office.soundEnabled', false);
    const configPath = path.join(tempHome, '.claude-office', 'config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    expect(parsed.standalone.soundEnabled).toBe(false);
    expect(parsed.standalone['claude-office.soundEnabled']).toBeUndefined();
  });

  // ── Per-namespace state file (agents + seats) ───────────────

  it('returns empty arrays/objects when state file does not exist', () => {
    const adapter = new FileStateAdapter({ namespace: 'standalone' });
    expect(adapter.loadAgents()).toEqual([]);
    expect(adapter.loadSeats()).toEqual({});
  });

  it('round-trips agents to the namespace-specific state file', () => {
    const adapter = new FileStateAdapter({ namespace: 'standalone' });
    const agents: PersistedAgent[] = [
      {
        id: 1,
        sessionId: 'sess-1',
        jsonlFile: '/tmp/sess-1.jsonl',
        projectDir: '/tmp/proj',
      },
    ];
    adapter.saveAgents(agents);
    expect(adapter.loadAgents()).toEqual(agents);
  });

  it('writes state at ~/.claude-office/<namespace>-state.json', () => {
    const adapter = new FileStateAdapter({ namespace: 'standalone' });
    adapter.saveSeats({ '1': { palette: 2, hueShift: 45 } });
    const stateFile = path.join(tempHome, '.claude-office', 'standalone-state.json');
    expect(fs.existsSync(stateFile)).toBe(true);
  });

  it('preserves seats when saving agents (and vice versa)', () => {
    const adapter = new FileStateAdapter({ namespace: 'standalone' });
    adapter.saveSeats({ '1': { palette: 3 } });
    adapter.saveAgents([{ id: 1, jsonlFile: '/x.jsonl', projectDir: '/tmp' }]);
    expect(adapter.loadSeats()).toEqual({ '1': { palette: 3 } });
    expect(adapter.loadAgents()).toHaveLength(1);
  });
});
