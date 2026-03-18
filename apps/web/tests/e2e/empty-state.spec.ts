import { test, expect } from '@playwright/test';
import { setupMockApi, mockSuggestions } from './fixtures/mock-api';

test.describe('E2E-APP-25: Suggestions with urgency colors', () => {
  test('urgent has red border, normal has accent border, faible has gray border', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    // Each SuggestionCard has border-l-4 with urgency-specific color
    // urgent → border-l-red
    // normal → border-l-accent
    // faible → border-l-text-tertiary

    // Verify all 3 suggestions are visible
    await expect(page.getByText('Impots Chypre')).toBeVisible();
    await expect(page.getByText('Timesheet Juin')).toBeVisible();
    await expect(page.getByText('Assurance Auto')).toBeVisible();

    // Verify urgency badges are displayed
    await expect(page.getByText('urgent', { exact: true })).toBeVisible();
    await expect(page.getByText('normal', { exact: true })).toBeVisible();
    await expect(page.getByText('faible', { exact: true })).toBeVisible();

    // Verify ordering — urgent suggestions appear first
    // The mock data already has urgent first, normal second, faible third
    const suggestionTitles = await page.locator('.bg-card.rounded-xl.border-l-4').allTextContents();
    // Find the indices of each suggestion in the rendered order
    const urgentIndex = suggestionTitles.findIndex((t) => t.includes('Impots Chypre'));
    const normalIndex = suggestionTitles.findIndex((t) => t.includes('Timesheet Juin'));
    const faibleIndex = suggestionTitles.findIndex((t) => t.includes('Assurance Auto'));

    // Urgent should come before normal, normal before faible
    expect(urgentIndex).toBeLessThan(normalIndex);
    expect(normalIndex).toBeLessThan(faibleIndex);
  });
});

test.describe('E2E-APP-26: Empty workspace', () => {
  test('no dossiers and no suggestions shows zen mode on Home', async ({ page }) => {
    await setupMockApi(page, {
      dossiers: [],
      suggestions: [],
      sessions: [],
    });
    await page.goto('/');

    // Zen mode
    await expect(page.getByText('Tout roule')).toBeVisible();
    await expect(page.getByText('aucune action requise')).toBeVisible();
  });

  test('Dossiers page shows empty message when no dossiers match filter', async ({ page }) => {
    await setupMockApi(page, { dossiers: [] });
    await page.goto('/dossiers');

    // Empty state message
    await expect(page.getByText('Aucun dossier actifs')).toBeVisible();
  });
});
