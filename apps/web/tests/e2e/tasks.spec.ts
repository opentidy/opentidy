// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.describe('E2E-APP-06: Tasks page shows list with filters', () => {
  test('displays filter buttons, search input, and + Nouveau button', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/tasks');

    // Page title
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();

    // Filter buttons with counts — EN COURS = 2, TERMINE = 1, BLOQUE = 1
    // Note: status uses TERMINE (no accent) in mock data
    await expect(page.getByRole('button', { name: /Actifs \(2\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Bloques \(1\)/ })).toBeVisible();

    // "+ Nouveau" button
    await expect(page.getByRole('button', { name: '+ Nouveau' })).toBeVisible();

    // Default filter "actifs" shows EN COURS tasks
    await expect(page.getByText('Invoices Acme')).toBeVisible();
    await expect(page.getByText('Insurance Report')).toBeVisible();

    // TERMINE and BLOQUE tasks not shown in default "actifs" filter
    await expect(page.getByText('Tax Filing 2025')).not.toBeVisible();
    await expect(page.getByText('Test Blocked')).not.toBeVisible();
  });

  test('switching filters shows different tasks', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/tasks');

    // Click "Bloques"
    await page.getByRole('button', { name: /Bloques/ }).click();
    await expect(page.getByText('Test Blocked')).toBeVisible();
    await expect(page.getByText('Invoices Acme')).not.toBeVisible();
  });
});

test.describe('E2E-APP-23: Search filter', () => {
  test('typing "acme" filters to only invoices-acme', async ({ page, browserName }, testInfo) => {
    // Search input is hidden on mobile (hidden md:block)
    if (testInfo.project.name === 'mobile') {
      test.skip();
      return;
    }

    await setupMockApi(page);
    await page.goto('/tasks');

    const searchInput = page.getByPlaceholder('Rechercher...');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('acme');

    // Only invoices-acme should be visible
    await expect(page.getByText('Invoices Acme')).toBeVisible();
    await expect(page.getByText('Insurance Report')).not.toBeVisible();
  });
});