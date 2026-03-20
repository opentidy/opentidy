// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

const mockModules = {
  modules: [
    {
      name: 'gmail',
      label: 'Gmail',
      description: 'Read, search, and draft emails via Gmail',
      icon: '📧',
      source: 'curated',
      enabled: true,
      components: { mcpServers: ['gmail'], skills: [], receivers: ['gmail-webhook'] },
      setup: { needsAuth: true, configFields: [], configured: true },
    },
    {
      name: 'telegram',
      label: 'Telegram',
      description: 'Send notifications via Telegram bot',
      icon: '📨',
      source: 'curated',
      enabled: false,
      components: { mcpServers: ['telegram'], skills: [], receivers: [] },
      setup: {
        needsAuth: false,
        configFields: [
          { key: 'botToken', label: 'Bot Token', type: 'password', required: true },
          { key: 'chatId', label: 'Chat ID', type: 'text', required: true },
        ],
        configured: false,
      },
    },
    {
      name: 'browser',
      label: 'Browser',
      description: 'Web browsing via Camoufox',
      icon: '🌐',
      source: 'curated',
      enabled: false,
      components: { mcpServers: ['camoufox'], skills: ['browser-skill'], receivers: [] },
    },
  ],
};

async function setupModulesMocks(page: import('@playwright/test').Page) {
  await page.route('**/api/setup/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ setupComplete: true }),
    }),
  );

  await page.route('**/api/modules', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: mockModules });
    }
    return route.fallback();
  });

  await page.route('**/api/modules/*/enable', (route) =>
    route.fulfill({ json: { ok: true } }),
  );

  await page.route('**/api/modules/*/disable', (route) =>
    route.fulfill({ json: { ok: true } }),
  );

  await page.route('**/api/modules/*/configure', (route) =>
    route.fulfill({ json: { ok: true } }),
  );
}

test.describe('E2E-MODULES-01: Settings page shows Modules section', () => {
  test('displays all module cards', async ({ page }) => {
    await setupMockApi(page);
    await setupModulesMocks(page);

    await page.goto('/settings');

    await expect(page.getByText('Gmail')).toBeVisible();
    await expect(page.getByText('Telegram')).toBeVisible();
    await expect(page.getByText('Browser')).toBeVisible();
  });
});

test.describe('E2E-MODULES-02: Module cards show component badges', () => {
  test('Gmail card shows MCP and Receiver badges', async ({ page }) => {
    await setupMockApi(page);
    await setupModulesMocks(page);

    await page.goto('/settings');

    // Locate the Gmail card and check its badges
    const gmailCard = page.locator('div').filter({ hasText: 'Read, search, and draft emails via Gmail' }).first();
    await expect(gmailCard.getByText('MCP')).toBeVisible();
    await expect(gmailCard.getByText('Receiver')).toBeVisible();
  });
});

test.describe('E2E-MODULES-03: Enable module calls API', () => {
  test('clicking toggle on Telegram calls POST /api/modules/telegram/enable', async ({ page }) => {
    await setupMockApi(page);
    await setupModulesMocks(page);

    let enableCalled = false;
    await page.route('**/api/modules/telegram/enable', (route) => {
      enableCalled = true;
      return route.fulfill({ json: { ok: true } });
    });

    await page.goto('/settings');

    // Find the Telegram module card and click its toggle (aria-checked=false → enable)
    const telegramCard = page.locator('div').filter({ hasText: 'Send notifications via Telegram bot' }).first();
    const toggle = telegramCard.getByRole('switch');
    await toggle.click();

    await page.waitForTimeout(200);
    expect(enableCalled).toBe(true);
  });
});

test.describe('E2E-MODULES-04: Configure button opens dialog', () => {
  test('clicking Configure on Telegram opens dialog with config fields', async ({ page }) => {
    await setupMockApi(page);

    // For this test, make Telegram need configuration (needsAuth: true, configured: false)
    const modulesWithUnconfigured = {
      modules: mockModules.modules.map((m) =>
        m.name === 'telegram'
          ? { ...m, setup: { ...m.setup, needsAuth: true, configured: false } }
          : m,
      ),
    };

    await page.route('**/api/setup/status', (route) =>
      route.fulfill({ json: { setupComplete: true } }),
    );
    await page.route('**/api/modules', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: modulesWithUnconfigured });
      }
      return route.fallback();
    });
    await page.route('**/api/modules/*/enable', (route) => route.fulfill({ json: { ok: true } }));
    await page.route('**/api/modules/*/configure', (route) => route.fulfill({ json: { ok: true } }));

    await page.goto('/settings');

    // Telegram card should show Configure button (needsAuth && !configured)
    const telegramCard = page.locator('div').filter({ hasText: 'Send notifications via Telegram bot' }).first();
    await telegramCard.getByRole('button', { name: 'Configure' }).click();

    // Dialog should appear with the config fields
    await expect(page.getByText('Bot Token')).toBeVisible();
    await expect(page.getByText('Chat ID')).toBeVisible();
  });
});
