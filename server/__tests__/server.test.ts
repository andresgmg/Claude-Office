import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use isolated temp HOME to avoid touching real ~/.pixel-agents/
let tmpBase: string;
let serverJsonDir: string;
let serverJsonPath: string;
let registryDir: string;

/** List registry entry files (excludes .tmp write-in-progress artifacts). */
function registryFiles(): string[] {
  try {
    return fs.readdirSync(registryDir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
}

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, homedir: () => tmpBase };
});

// Must import AFTER mock setup
const { PixelAgentsServer } = await import('../src/server.js');

async function postHook(
  port: number,
  token: string,
  body: string,
  providerId = 'claude',
): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/api/hooks/${providerId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body,
  });
}

describe('PixelAgentsServer', () => {
  let server: InstanceType<typeof PixelAgentsServer>;

  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-server-test-'));
    serverJsonDir = path.join(tmpBase, '.pixel-agents');
    serverJsonPath = path.join(serverJsonDir, 'server.json');
    registryDir = path.join(serverJsonDir, 'servers');
    fs.mkdirSync(serverJsonDir, { recursive: true });
    server = new PixelAgentsServer();
  });

  afterEach(() => {
    server?.stop();
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  // 1. Server starts and returns config
  it('starts and returns config with port, token, pid', async () => {
    const config = await server.start();
    expect(config.port).toBeGreaterThan(0);
    expect(config.token).toBeTruthy();
    expect(config.pid).toBe(process.pid);
    expect(config.startedAt).toBeGreaterThan(0);
  });

  // 2. Health endpoint returns 200 + uptime
  it('health endpoint returns 200 with uptime', async () => {
    const config = await server.start();
    const res = await fetch(`http://127.0.0.1:${config.port}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; uptime: number; pid: number };
    expect(body.status).toBe('ok');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.pid).toBe(process.pid);
  });

  // 3. Hook endpoint requires auth
  it('hook endpoint returns 401 without auth', async () => {
    const config = await server.start();
    const res = await fetch(`http://127.0.0.1:${config.port}/api/hooks/claude`, {
      method: 'POST',
      body: '{}',
    });
    expect(res.status).toBe(401);
  });

  // 4. Hook endpoint accepts valid auth
  it('hook endpoint returns 200 with valid auth', async () => {
    const config = await server.start();
    const res = await postHook(
      config.port,
      config.token,
      JSON.stringify({ session_id: 'test', hook_event_name: 'Stop' }),
    );
    expect(res.status).toBe(200);
  });

  // 5. Hook callback fires on valid event
  it('hook callback fires on valid event', async () => {
    const config = await server.start();
    const received: Array<{ providerId: string; event: Record<string, unknown> }> = [];
    server.onHookEvent((providerId: string, event: Record<string, unknown>) => {
      received.push({ providerId, event });
    });

    await postHook(
      config.port,
      config.token,
      JSON.stringify({ session_id: 'abc', hook_event_name: 'Stop' }),
    );

    expect(received).toHaveLength(1);
    expect(received[0].providerId).toBe('claude');
    expect(received[0].event.session_id).toBe('abc');
    expect(received[0].event.hook_event_name).toBe('Stop');
  });

  // 6. Hook endpoint rejects oversized body
  it('hook endpoint returns 413 for oversized body', async () => {
    const config = await server.start();
    const bigBody = 'x'.repeat(70_000); // > 64KB
    const res = await postHook(config.port, config.token, bigBody);
    expect(res.status).toBe(413);
  });

  // 7. Hook endpoint rejects invalid JSON
  it('hook endpoint returns 400 for invalid JSON', async () => {
    const config = await server.start();
    const res = await postHook(config.port, config.token, 'not json {{{');
    expect(res.status).toBe(400);
  });

  // 8. Hook endpoint rejects missing provider ID
  it('hook endpoint returns 400 for missing provider ID', async () => {
    const config = await server.start();
    const res = await fetch(`http://127.0.0.1:${config.port}/api/hooks/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}` },
      body: '{}',
    });
    expect(res.status).toBe(400);
  });

  // 9. server.json written
  it('writes server.json with port, pid, token', async () => {
    const config = await server.start();
    const json = JSON.parse(fs.readFileSync(serverJsonPath, 'utf-8'));
    expect(json.port).toBe(config.port);
    expect(json.pid).toBe(process.pid);
    expect(json.token).toBe(config.token);
  });

  // 10. Registry entry written alongside the legacy server.json
  it('writes a registry entry with port, pid, servesSpa, protocol', async () => {
    const config = await server.start();
    const files = registryFiles();
    expect(files).toHaveLength(1);
    const entry = JSON.parse(fs.readFileSync(path.join(registryDir, files[0]), 'utf-8'));
    expect(entry.port).toBe(config.port);
    expect(entry.pid).toBe(process.pid);
    expect(entry.token).toBe(config.token);
    expect(entry.servesSpa).toBe(true); // the web server always serves the SPA
    expect(typeof entry.protocol).toBe('number');
  });

  // 11. A second instance reuses the existing live server instead of starting its own
  it('second instance reuses an existing server', async () => {
    const config1 = await server.start();
    const server2 = new PixelAgentsServer();
    const config2 = await server2.start();
    expect(config2.port).toBe(config1.port);
    expect(config2.pid).toBe(config1.pid);
    expect(config2.token).toBe(config1.token);
    expect(registryFiles()).toHaveLength(1); // reuse -- server2 wrote no entry of its own
    server2.stop(); // should not delete server.json / the registry entry (not owner)
    expect(registryFiles()).toHaveLength(1);
    expect(fs.existsSync(serverJsonPath)).toBe(true);
  });

  // 16. Dead-pid registry entries are pruned on start, never reused
  it('prunes dead-pid registry entries on start instead of reusing them', async () => {
    fs.mkdirSync(registryDir, { recursive: true });
    const staleFile = path.join(registryDir, '999999-9999.json');
    fs.writeFileSync(
      staleFile,
      JSON.stringify({
        port: 9999,
        pid: 999999,
        token: 'stale',
        startedAt: 0,
        servesSpa: true,
        protocol: 1,
      }),
    );

    const config = await server.start();

    expect(fs.existsSync(staleFile)).toBe(false); // pruned, not left behind
    expect(config.port).not.toBe(9999); // never reused the dead entry -- started its own
    expect(registryFiles()).toHaveLength(1); // only the freshly-started server's entry remains
  });

  // 17. Structurally invalid live-pid entries are malformed, not reusable
  it('prunes a structurally invalid live-pid entry instead of reusing it', async () => {
    fs.mkdirSync(registryDir, { recursive: true });
    const malformedFile = path.join(registryDir, `${process.pid}-70000.json`);
    fs.writeFileSync(
      malformedFile,
      JSON.stringify({
        port: 70_000,
        pid: process.pid,
        token: 'invalid-port',
        startedAt: Date.now(),
        servesSpa: true,
        protocol: 1,
      }),
    );

    const config = await server.start();

    expect(config.port).not.toBe(70_000);
    expect(fs.existsSync(malformedFile)).toBe(false);
    expect(registryFiles()).toHaveLength(1);
  });

  // 18. server.json cleaned up on stop
  it('deletes server.json on stop', async () => {
    await server.start();
    expect(fs.existsSync(serverJsonPath)).toBe(true);
    server.stop();
    expect(fs.existsSync(serverJsonPath)).toBe(false);
  });

  // 19. server.json NOT deleted if PID mismatch
  it('does not delete server.json if PID mismatch', async () => {
    // Write fake server.json with different PID
    fs.writeFileSync(
      serverJsonPath,
      JSON.stringify({ port: 9999, pid: 999999, token: 'fake', startedAt: 0 }),
    );
    // Server never started (it would reuse), just stop
    const server2 = new PixelAgentsServer();
    server2.stop();
    expect(fs.existsSync(serverJsonPath)).toBe(true);
  });

  // 20. stop() removes only this server's own registry entry, preserves another live one (D6)
  it('deletes only its own registry entry on stop, preserving a coexisting server', async () => {
    const ownConfig = await server.start();
    // A second live server, registered by hand: starting one for real would
    // simply reuse ours (there is a single capability now).
    fs.writeFileSync(
      path.join(registryDir, `${process.pid}-65000.json`),
      JSON.stringify({
        port: 65_000,
        pid: process.pid,
        token: 'other-live-server',
        startedAt: Date.now(),
        servesSpa: true,
        protocol: 1,
      }),
    );
    expect(registryFiles()).toHaveLength(2);

    server.stop();

    // Only our own entry is gone; the other live server's entry is untouched
    // (self-only cleanup, D6).
    const remaining = registryFiles().map(
      (f) => JSON.parse(fs.readFileSync(path.join(registryDir, f), 'utf-8')) as { port: number },
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0].port).toBe(65_000);
    expect(remaining.some((e) => e.port === ownConfig.port)).toBe(false);
  });

  // 21. Unknown route returns 404
  it('unknown route returns 404', async () => {
    const config = await server.start();
    const res = await fetch(`http://127.0.0.1:${config.port}/random/path`);
    expect(res.status).toBe(404);
  });

  // 22. Hook callback does NOT fire for events missing required fields
  it('hook callback does not fire for events without session_id', async () => {
    const config = await server.start();
    const received: unknown[] = [];
    server.onHookEvent((_pid: string, event: Record<string, unknown>) => received.push(event));

    await postHook(
      config.port,
      config.token,
      JSON.stringify({ hook_event_name: 'Stop' }), // missing session_id
    );

    expect(received).toHaveLength(0);
  });
});
