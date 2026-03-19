// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.describe('Setup Wizard', () => {
  test('redirects to /setup when setupComplete is false', async ({ page }) => {
    await page.route('**/api/setup/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ setupComplete: false }),
      }),
    );

    await page.goto('/');
    await page.waitForURL('**/setup');

    await expect(page.locator('text=Welcome')).toBeVisible();
  });

  test('shows user info form on step 1', async ({ page }) => {
    await page.route('**/api/setup/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ setupComplete: false }),
      }),
    );

    await page.goto('/setup');

    await expect(page.getByPlaceholder('Alice')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  });

  test('advances to agent step after filling user info', async ({ page }) => {
    await page.route('**/api/setup/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ setupComplete: false }),
      }),
    );

    await page.route('**/api/setup/user-info', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      }),
    );

    await page.route('**/api/setup/agents', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          agents: [
            { name: 'claude', label: 'Claude Code', status: 'stable', installed: false, authenticated: false },
            { name: 'gemini', label: 'Gemini CLI', status: 'experimental', installed: false, authenticated: false },
            { name: 'copilot', label: 'GitHub Copilot CLI', status: 'coming-soon', installed: false, authenticated: false },
          ],
        }),
      }),
    );

    await page.goto('/setup');

    await page.getByPlaceholder('Alice').fill('Test User');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('button', { name: 'Connect' }).first()).toBeVisible();
  });

  test('does not redirect when setupComplete is true', async ({ page }) => {
    await page.route('**/api/setup/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ setupComplete: true }),
      }),
    );

    await setupMockApi(page);

    await page.goto('/');
    await page.waitForTimeout(500);

    expect(page.url()).not.toContain('/setup');
  });
});
