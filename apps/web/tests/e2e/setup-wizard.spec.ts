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

  test('wizard shows modules step after permissions', async ({ page }) => {
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
        body: JSON.stringify([
          { name: 'claude', label: 'Claude Code', badge: 'stable', installed: true, authed: true },
          { name: 'gemini', label: 'Gemini CLI', badge: 'experimental', installed: false, authed: false },
          { name: 'copilot', label: 'GitHub Copilot CLI', badge: 'coming-soon', installed: false, authed: false },
        ]),
      }),
    );

    await page.route('**/api/setup/permissions', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { name: 'accessibility', label: 'Accessibility', app: 'System Events', required: true, granted: true },
          { name: 'contacts', label: 'Contacts', app: 'Contacts', required: false, granted: true },
        ]),
      }),
    );

    await page.route('**/api/modules', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          modules: [
            {
              name: 'email',
              label: 'Email',
              description: 'Read, search, and send emails via IMAP/SMTP (any provider)',
              icon: '📧',
              source: 'curated',
              enabled: true,
              components: { mcpServers: [], skills: [{ name: 'email-skill' }], receivers: [{ name: 'email-imap', mode: 'polling', source: 'email' }] },
              setup: { needsAuth: true, configFields: [], configured: true },
            },
            {
              name: 'telegram',
              label: 'Telegram',
              description: 'Send notifications via Telegram bot',
              icon: '📨',
              source: 'curated',
              enabled: false,
              components: { mcpServers: [{ name: 'telegram' }], skills: [], receivers: [] },
              setup: { needsAuth: false, configFields: [], configured: false },
            },
          ],
        }),
      }),
    );

    await page.route('**/api/setup/complete', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      }),
    );

    // Also mock app routes needed after setup completes
    await setupMockApi(page);

    await page.goto('/setup');

    // Step 1: fill user info
    await page.getByPlaceholder('Alice').fill('Test User');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2: agent step: claude is already connected, Continue is enabled
    await expect(page.getByText('Claude Code')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3: permissions step: all granted, Continue available
    await expect(page.getByText('Accessibility')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 4: modules step
    await expect(page.getByText('Email')).toBeVisible();
    await expect(page.getByText('Telegram')).toBeVisible();

    // Continue to done step
    await page.getByRole('button', { name: 'Continue' }).click();

    // Done step
    await expect(page.getByText('OpenTidy is ready!')).toBeVisible();
  });
});
