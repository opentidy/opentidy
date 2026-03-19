// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.describe('E2E-APP-27: Deep link to dossier', () => {
  test('navigate directly to /dossier/invoices-acme shows correct dossier', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/dossier/invoices-acme');

    // Correct dossier is displayed
    await expect(page.getByRole('heading', { name: 'Invoices Acme' })).toBeVisible();
    await expect(page.getByText('En cours')).toBeVisible();
    // StateRenderer shows "Objectif" heading — visible in whichever viewport
    await expect(page.locator('h3:visible', { hasText: 'Objectif' })).toBeVisible();
  });

  test('deep link to non-existent dossier shows loading state', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/dossier/does-not-exist');

    // Shows "Chargement..." since dossier won't be found
    await expect(page.getByText('Chargement...')).toBeVisible();
  });
});