import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Settings-modal drivers for the SPA the standalone CLI serves. Every helper
 * takes the Playwright `Page` the standalone fixture opened on the printed URL
 * and works through the real modal UI, the same way a user does.
 */

const WEBVIEW_TIMEOUT_MS = 30_000;

export interface WebviewSettings {
  watchAllSessions?: boolean;
  hooksEnabled?: boolean;
  alwaysShowLabels?: boolean;
  debugView?: boolean;
}

async function setCheckbox(modal: Locator, label: string, checked: boolean): Promise<void> {
  const button = modal.locator('button', { hasText: label });
  await expect(button).toBeVisible({ timeout: WEBVIEW_TIMEOUT_MS });

  const indicator = button.locator('span').last();
  const isChecked = ((await indicator.textContent()) ?? '').trim().toLowerCase() === 'x';
  if (isChecked !== checked) {
    await button.click();
  }
}

export async function openSettingsModal(page: Page): Promise<Locator> {
  const settingsButton = page.locator('button', { hasText: 'Settings' });
  await expect(settingsButton).toBeVisible({ timeout: WEBVIEW_TIMEOUT_MS });
  await settingsButton.click();

  const settingsModal = page
    .locator('div.fixed')
    .filter({ has: page.getByText('Settings', { exact: true }) });
  await expect(settingsModal).toBeVisible({ timeout: WEBVIEW_TIMEOUT_MS });
  return settingsModal;
}

async function closeSettingsModal(settingsModal: Locator): Promise<void> {
  const closeButton = settingsModal.getByRole('button', { name: 'x', exact: true });
  await expect(closeButton).toBeVisible({ timeout: WEBVIEW_TIMEOUT_MS });
  await closeButton.click();
  await expect(settingsModal).toBeHidden({ timeout: WEBVIEW_TIMEOUT_MS });
}

export async function setSettings(page: Page, settings: WebviewSettings): Promise<void> {
  const settingsModal = await openSettingsModal(page);

  if (settings.watchAllSessions !== undefined) {
    await setCheckbox(settingsModal, 'Watch All Sessions', settings.watchAllSessions);
  }
  if (settings.hooksEnabled !== undefined) {
    await setCheckbox(settingsModal, 'Instant Detection (Hooks)', settings.hooksEnabled);
  }
  if (settings.alwaysShowLabels !== undefined) {
    await setCheckbox(settingsModal, 'Always Show Labels', settings.alwaysShowLabels);
  }
  if (settings.debugView !== undefined) {
    await setCheckbox(settingsModal, 'Debug View', settings.debugView);
  }

  await closeSettingsModal(settingsModal);

  // Let the server persist the settings round-trip before the test continues.
  await page.waitForTimeout(500);
}
