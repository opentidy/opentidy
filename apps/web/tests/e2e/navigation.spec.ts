// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.describe('E2E-APP-27: Deep link to task', () => {
  test('navigate directly to /task/invoices-acme shows correct task', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/task/invoices-acme');

    // Correct task is displayed
    await expect(page.getByRole('heading', { name: 'Invoices Acme' })).toBeVisible();
    await expect(page.getByText('En cours')).toBeVisible();
    // StateRenderer shows "Objectif" heading, visible in whichever viewport
    await expect(page.locator('h3:visible', { hasText: 'Objectif' })).toBeVisible();
  });

  test('deep link to non-existent task shows loading state', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/task/does-not-exist');

    // Shows "Chargement..." since task won't be found
    await expect(page.getByText('Chargement...')).toBeVisible();
  });
});