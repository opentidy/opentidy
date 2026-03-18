import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.describe('E2E-APP-06: Dossiers page shows list with filters', () => {
  test('displays filter buttons, search input, and + Nouveau button', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/dossiers');

    // Page title
    await expect(page.getByRole('heading', { name: 'Dossiers' })).toBeVisible();

    // Filter buttons with counts — EN COURS = 2, TERMINE = 1, BLOQUE = 1
    // Note: status uses TERMINE (no accent) in mock data
    await expect(page.getByRole('button', { name: /Actifs \(2\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Bloques \(1\)/ })).toBeVisible();

    // "+ Nouveau" button
    await expect(page.getByRole('button', { name: '+ Nouveau' })).toBeVisible();

    // Default filter "actifs" shows EN COURS dossiers
    await expect(page.getByText('Factures Sopra')).toBeVisible();
    await expect(page.getByText('Exali Rapport')).toBeVisible();

    // TERMINE and BLOQUE dossiers not shown in default "actifs" filter
    await expect(page.getByText('Impots 2025')).not.toBeVisible();
    await expect(page.getByText('Test Bloque')).not.toBeVisible();
  });

  test('switching filters shows different dossiers', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/dossiers');

    // Click "Bloques"
    await page.getByRole('button', { name: /Bloques/ }).click();
    await expect(page.getByText('Test Bloque')).toBeVisible();
    await expect(page.getByText('Factures Sopra')).not.toBeVisible();
  });
});

test.describe('E2E-APP-23: Search filter', () => {
  test('typing "sopra" filters to only factures-sopra', async ({ page, browserName }, testInfo) => {
    // Search input is hidden on mobile (hidden md:block)
    if (testInfo.project.name === 'mobile') {
      test.skip();
      return;
    }

    await setupMockApi(page);
    await page.goto('/dossiers');

    const searchInput = page.getByPlaceholder('Rechercher...');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('sopra');

    // Only factures-sopra should be visible
    await expect(page.getByText('Factures Sopra')).toBeVisible();
    await expect(page.getByText('Exali Rapport')).not.toBeVisible();
  });
});
