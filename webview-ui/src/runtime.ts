/**
 * Runtime flags for the browser SPA.
 */

/**
 * True only under the Playwright e2e harness, which sets `__CLAUDE_OFFICE_E2E`
 * via `addInitScript` before any app code runs. Gates test-only diagnostics
 * (window.__claudeOfficeTestHooks message/sound logs, the addAgent wrapper) so
 * they never run, and never grow unbounded, in a real user's session.
 */
export const isE2E: boolean =
  typeof window !== 'undefined' &&
  (window as unknown as { __CLAUDE_OFFICE_E2E?: boolean }).__CLAUDE_OFFICE_E2E === true;
