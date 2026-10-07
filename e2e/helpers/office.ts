import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

const OVERLAY_TIMEOUT_MS = 15_000;

/**
 * Agent-overlay and character helpers for the SPA page the standalone fixture
 * opens. Overlays are DOM (`[data-testid="agent-overlay"]`) and are queried
 * with Playwright locators. Characters, seats and renderer settings exist only
 * on the canvas, so those helpers read `window.__claudeOfficeTestHooks` from
 * inside `page.evaluate` — the observability surface webview-ui/src/testHooks.ts
 * installs when the page is flagged as the e2e harness.
 *
 * Wait-strategy conventions for tests using this helper module:
 *
 * 1. **Positive assertion** ("X should appear"): use `expectOverlayVisible`,
 *    `expectOverlayCount(N>0)`, or `expectOverlayVisibleWithTexts`. These poll
 *    until the assertion succeeds or the timeout expires — no explicit
 *    `waitForTimeout` is needed before them.
 *
 * 2. **Negative assertion** ("X should NOT appear"): use `expectNoOverlay` /
 *    `expectNoOverlayWithTexts` with the desired timeout. A brief
 *    `waitForTimeout` before is a settling wait (give the runtime a chance to
 *    do the wrong thing before checking absence). Keep these short (<1s).
 *
 * 3. **Stability check** ("state remains correct N seconds later"): use
 *    `waitForTimeout(N)` followed by a re-assertion. This pattern guards
 *    against bugs where a state transition is correct momentarily then
 *    regresses (e.g. cleanup race vs. zombie re-spawn). Polling cannot
 *    replace stability checks because `expect.poll` returns at the first
 *    match, not after the state holds for N seconds.
 */

export function getAgentOverlays(page: Page): Locator {
  return page.locator('[data-testid="agent-overlay"]');
}

export function getOverlayByText(page: Page, text: string): Locator {
  return getAgentOverlays(page).filter({ hasText: text });
}

export function getOverlayByTexts(page: Page, texts: string[]): Locator {
  return texts.reduce<Locator>(
    (locator, text) => locator.filter({ hasText: text }),
    getAgentOverlays(page),
  );
}

export function getOverlayByAgentId(page: Page, agentId: number): Locator {
  return page.locator(`[data-testid="agent-overlay"][data-agent-id="${agentId}"]`);
}

export async function expectOverlayCount(
  page: Page,
  count: number,
  timeout = OVERLAY_TIMEOUT_MS,
): Promise<void> {
  await expect(getAgentOverlays(page)).toHaveCount(count, { timeout });
}

export async function expectOverlayVisible(
  page: Page,
  text: string,
  timeout = OVERLAY_TIMEOUT_MS,
): Promise<void> {
  await expect(getOverlayByText(page, text).first()).toBeVisible({ timeout });
}

export async function expectOverlayVisibleWithTexts(
  page: Page,
  texts: string[],
  timeout = OVERLAY_TIMEOUT_MS,
): Promise<void> {
  await expect(getOverlayByTexts(page, texts).first()).toBeVisible({ timeout });
}

export async function expectOverlayVisibleForAgent(
  page: Page,
  agentId: number,
  text: string,
  timeout = OVERLAY_TIMEOUT_MS,
): Promise<void> {
  await expect(getOverlayByAgentId(page, agentId).filter({ hasText: text })).toBeVisible({
    timeout,
  });
}

export async function expectNoOverlay(page: Page, text: string, timeout = 1_000): Promise<void> {
  await expect(getOverlayByText(page, text)).toHaveCount(0, { timeout });
}

export async function expectNoOverlayWithTexts(
  page: Page,
  texts: string[],
  timeout = 1_000,
): Promise<void> {
  await expect(getOverlayByTexts(page, texts)).toHaveCount(0, { timeout });
}

/**
 * Context gauges. Every agent that has taken a turn shows one; sub-agents
 * never do, so the count doubles as an assertion about who owns a session.
 */
export function getContextGauges(page: Page): Locator {
  return page.locator('[data-testid="context-gauge"]');
}

export async function expectContextGauge(
  page: Page,
  percent: number,
  timeout = OVERLAY_TIMEOUT_MS,
): Promise<void> {
  await expect(getContextGauges(page).first()).toHaveAttribute(
    'data-context-pct',
    String(percent),
    { timeout },
  );
}

export async function readAgentOverlayIds(page: Page): Promise<number[]> {
  const rawIds = await getAgentOverlays(page).evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-agent-id')),
  );

  return rawIds.flatMap((value) => {
    const id = Number(value);
    return Number.isFinite(id) ? [id] : [];
  });
}

export async function readAgentOverlayTexts(
  page: Page,
): Promise<Array<{ id: number; text: string }>> {
  return getAgentOverlays(page).evaluateAll((elements) =>
    elements.flatMap((element) => {
      const rawId = element.getAttribute('data-agent-id');
      const id = Number(rawId);
      if (!Number.isFinite(id)) {
        return [];
      }
      return [
        {
          id,
          text: element.textContent ?? '',
        },
      ];
    }),
  );
}

/** Wait for a specific agent's overlay to disappear. Prefer this over a global
 *  count-0 assertion when a replacement character may render around the same
 *  time — the global 0-count window can be shorter than Playwright's poll
 *  interval on slow runners. */
export async function expectAgentOverlayGone(
  page: Page,
  agentId: number,
  timeout = OVERLAY_TIMEOUT_MS,
): Promise<void> {
  await expect(getOverlayByAgentId(page, agentId)).toHaveCount(0, { timeout });
}

export async function expectSingleAgentOverlay(page: Page): Promise<number> {
  await expectOverlayCount(page, 1);
  const ids = await readAgentOverlayIds(page);
  if (ids.length !== 1) {
    throw new Error(`Expected exactly one agent overlay id, got ${JSON.stringify(ids)}`);
  }
  return ids[0]!;
}

/**
 * Assert whether the office's single character is drawn as a ghost — the
 * translucent rendering a headless agent (one Claude Office adopted rather than
 * launched) gets while "Display Headless as Ghosts" is on.
 *
 * Both inputs to that decision are canvas-only: the per-character flag and the
 * renderer's setting. So this reads them through the test hooks and combines
 * them the same way the renderer does — same rationale as getCharacters/getPets.
 */
export async function expectCharacterGhosted(page: Page, ghosted: boolean): Promise<void> {
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          interface GhostHooks {
            getCharacters?: () => Array<{ id: number; isHeadless?: boolean }>;
            getGhostHeadlessAgents?: () => boolean;
          }
          const hooks = (window as { __claudeOfficeTestHooks?: GhostHooks })
            .__claudeOfficeTestHooks;
          const characters = hooks?.getCharacters?.() ?? [];
          if (characters.length !== 1) return `expected 1 character, got ${characters.length}`;
          const setting = hooks?.getGhostHeadlessAgents?.() ?? false;
          return characters[0]!.isHeadless === true && setting;
        }),
      { timeout: OVERLAY_TIMEOUT_MS },
    )
    .toBe(ghosted);
}

/**
 * Assert the named teammate character occupies the free seat closest to its
 * lead. Seats and characters render only on the canvas (no DOM), so this reads
 * through the test hooks — the same rationale as getCharacters/getPets.
 *
 * Invariant checked: the teammate took the closest free seat at spawn time, so
 * afterwards no still-free seat may be strictly closer to the lead than the
 * teammate's own seat. Assumes the lead is the only other seated agent (true
 * for the lead+teammate scenarios that call this).
 */
export async function expectTeammateSeatedNextToLead(
  page: Page,
  teammateName: string,
): Promise<void> {
  const report = await page.evaluate((name) => {
    interface SeatHooks {
      getCharacters?: () => Array<{ id: number; agentName?: string }>;
      getAgentSeats?: () => Array<{ id: number; seatId: string | null }>;
      getSeats?: () => Array<{ uid: string; col: number; row: number; assigned: boolean }>;
    }
    const hooks = (window as { __claudeOfficeTestHooks?: SeatHooks }).__claudeOfficeTestHooks;
    const characters = hooks?.getCharacters?.() ?? [];
    const agentSeats = hooks?.getAgentSeats?.() ?? [];
    const seats = hooks?.getSeats?.() ?? [];
    const teammate = characters.find((ch) => ch.agentName === name);
    if (!teammate) return { error: `no character named "${name}"` };
    const teammateSeatId = agentSeats.find((a) => a.id === teammate.id)?.seatId;
    const leadSeatId = agentSeats.find((a) => a.id !== teammate.id)?.seatId;
    const seatByUid = new Map(seats.map((s) => [s.uid, s]));
    const teammateSeat = teammateSeatId ? seatByUid.get(teammateSeatId) : undefined;
    const leadSeat = leadSeatId ? seatByUid.get(leadSeatId) : undefined;
    if (!teammateSeat || !leadSeat) return { error: 'lead or teammate has no seat' };
    const dist = (s: { col: number; row: number }): number =>
      Math.abs(s.col - leadSeat.col) + Math.abs(s.row - leadSeat.row);
    const teammateDist = dist(teammateSeat);
    const closerFreeSeat = seats.find((s) => !s.assigned && dist(s) < teammateDist) ?? null;
    return { error: null, teammateDist, closerFreeSeat };
  }, teammateName);

  expect(report, 'teammate and lead must both be seated').toMatchObject({ error: null });
  expect(report, 'no free seat may be closer to the lead than the teammate seat').toMatchObject({
    closerFreeSeat: null,
  });
}

/** Select a character (agent or sub-agent) through the deterministic test hook
 *  — the same officeState.selectedAgentId a canvas click sets. Sub-agents use
 *  negative ids (first sub is -1). Selection is what reveals a sub-agent's
 *  live activity text in its overlay (hover shows only the subtask title). */
export async function selectCharacter(page: Page, agentId: number): Promise<void> {
  await page.evaluate((id) => {
    interface SelectionHooks {
      selectAgent?: (id: number) => void;
    }
    (window as { __claudeOfficeTestHooks?: SelectionHooks }).__claudeOfficeTestHooks?.selectAgent?.(
      id,
    );
  }, agentId);
}

export async function closeAgentFromOverlay(
  page: Page,
  options: { agentId?: number; text?: string },
  timeout = OVERLAY_TIMEOUT_MS,
): Promise<void> {
  const overlay =
    options.agentId !== undefined
      ? getOverlayByAgentId(page, options.agentId).first()
      : getOverlayByText(page, options.text ?? '').first();
  await expect(overlay).toBeVisible({ timeout });

  // Selecting an agent is what reveals its "Close agent" (×) button. The
  // production path selects via a canvas hit-test on the sprite; driving that
  // from a test means computing pixel offsets below the overlay, which is
  // geometry-brittle and flaky. Instead, select deterministically through the
  // test hook: it sets officeState.selectedAgentId (the same state a click
  // sets), and ToolOverlay re-renders every rAF, so the × button surfaces and
  // becomes clickable on the next frame. The overlay carries its agent id as
  // data-agent-id, so the text-based lookup path resolves an id too.
  const agentId = options.agentId ?? Number(await overlay.getAttribute('data-agent-id'));
  await selectCharacter(page, agentId);

  const closeButton = overlay.locator('button[title="Close agent"]');
  await expect(closeButton).toBeVisible({ timeout });
  await closeButton.click();
}
