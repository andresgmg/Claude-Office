import fs from 'node:fs';
import path from 'node:path';

import { namespaceE2EPath } from './run-config';

const REPO_ROOT = path.join(__dirname, '..');
const ALLURE_RESULTS_DIR = namespaceE2EPath(path.join(REPO_ROOT, 'allure-results', 'e2e'));
const STANDALONE_CLI = path.join(REPO_ROOT, 'dist', 'cli.js');

/**
 * Runs once per `playwright test` invocation, before any worker starts.
 *
 * The suite drives the standalone CLI (dist/cli.js) in Playwright's own
 * chromium, so there is nothing to download here: `npm run compile` produces
 * the server bundle and the SPA it serves. What remains is housekeeping:
 *
 * 1. Clear stale Allure results, so a report built from the directory
 *    describes only this run (`namespaceE2EPath` keeps parallel CI runs apart).
 * 2. Fail fast, once, when the build is missing. e2e/helpers/standalone.ts
 *    repeats this check per test, but ten identical failures bury the cause.
 */
export default async function globalSetup(): Promise<void> {
  fs.rmSync(ALLURE_RESULTS_DIR, { recursive: true, force: true });

  if (!fs.existsSync(STANDALONE_CLI)) {
    throw new Error(
      `Standalone CLI not built at ${STANDALONE_CLI}. Run 'npm run compile' before the e2e suite.`,
    );
  }
}
