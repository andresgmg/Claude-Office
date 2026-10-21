import { defineConfig } from '@playwright/test';
import path from 'path';

import { namespaceE2EPath } from './run-config';

process.env['ALLURE_LABEL_epic'] ??= 'e2e';

const artifactsDir = namespaceE2EPath(path.join(__dirname, '../test-results/e2e'));
const allureResultsDir = namespaceE2EPath(path.join(__dirname, '../allure-results/e2e'));
const htmlReportDir = namespaceE2EPath(path.join(__dirname, '../playwright-report/e2e'));

export default defineConfig({
  testDir: path.join(__dirname, 'tests'),
  timeout: 120_000,
  globalSetup: path.join(__dirname, 'global-setup.ts'),
  reporter: [
    ['list'],
    [
      'html',
      {
        // Must be outside outputDir to avoid Playwright clearing artifacts
        outputFolder: htmlReportDir,
        open: 'never',
      },
    ],
    [
      'allure-playwright',
      {
        resultsDir: allureResultsDir,
      },
    ],
  ],
  outputDir: artifactsDir,
  // The suite runs on Playwright's standard browser `page` fixture, so `video`
  // applies to every test. Host logs, server.json and a final screenshot are
  // attached by the standalone fixture's teardown.
  use: {
    video: 'on',
  },
  // Default to one worker locally; CI can override this with --workers.
  workers: 1,
  // Shard distribution at test level (not file level), so CI shards stay
  // balanced even when one spec file holds most of the tests. workers=1 still
  // keeps tests sequential within a shard; only the shard assignment strategy
  // changes.
  fullyParallel: true,
  // Retry once for tests that are sensitive to ordering / load (timing-driven
  // assertions about hook + file-watcher races). Tests that pass in isolation
  // but flake under serial load see this; the retry hides true flakes while
  // still surfacing genuinely broken tests.
  retries: 1,
});
