// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.describe('E2E-APP-12: Terminal shows session tabs with status indicators', () => {
  test('displays tabs for each active session with colored dots', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/terminal');

    // Session tabs: taskId with hyphens replaced by spaces
    await expect(page.getByRole('button', { name: /invoices acme/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /insurance report/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /blocked test/i })).toBeVisible();

    // MFA label on the mfa session
    await expect(page.getByText('MFA')).toBeVisible();
  });
});

test.describe('E2E-APP-13: Terminal shows TerminalPane when tab selected', () => {
  test('TerminalPane component is rendered for active session', async ({ page }) => {
    await setupMockApi(page);

    // Block WebSocket connections (terminal tries to connect)
    await page.route('**/ws/terminal/**', (route) => route.abort());

    await page.goto('/terminal');

    // The first session is auto-selected. TerminalPane container div exists
    // xterm creates a div with class "xterm" inside
    // We just verify the terminal pane area exists (the div container)
    const terminalArea = page.locator('.xterm');
    // Wait for xterm to mount; it may take a moment
    await expect(terminalArea).toBeVisible({ timeout: 5000 });
  });
});

test.describe('E2E-APP-14: Terminal shows status bar', () => {
  test('status bar displays session name and status', async ({ page }) => {
    await setupMockApi(page);
    await page.route('**/ws/terminal/**', (route) => route.abort());
    await page.goto('/terminal');

    // Status bar shows session id and "tmux"
    await expect(page.getByText('opentidy-invoices-acme - tmux')).toBeVisible();

    // Status text for active session
    await expect(page.getByText(/Active/)).toBeVisible();
  });
});

test.describe('E2E-APP-24: Terminal on mobile viewport', () => {
  test('tabs and terminal are visible on mobile', async ({ page }, testInfo) => {
    if (testInfo.project.name !== 'mobile') {
      test.skip();
      return;
    }

    await setupMockApi(page);
    await page.route('**/ws/terminal/**', (route) => route.abort());
    await page.goto('/terminal');

    // Tabs should still be visible
    await expect(page.getByRole('button', { name: /invoices acme/i })).toBeVisible();

    // Terminal pane should render
    const terminalArea = page.locator('.xterm');
    await expect(terminalArea).toBeVisible({ timeout: 5000 });
  });
});