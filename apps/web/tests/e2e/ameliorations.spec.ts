import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.describe('E2E-APP-17: Ameliorations page shows cards', () => {
  test('displays cards with title, problem, impact, suggestion, and actions', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/ameliorations');

    // Page title
    await expect(page.getByRole('heading', { name: 'Ameliorations' })).toBeVisible();

    // Default filter is "ouverts" — 2 unresolved ameliorations
    await expect(page.getByText('MFA TOTP exali')).toBeVisible();
    await expect(page.getByText('Rate limit Gmail')).toBeVisible();

    // Problem text
    await expect(page.getByText('Cannot handle TOTP')).toBeVisible();
    await expect(page.getByText('Too many API calls')).toBeVisible();

    // Impact sections
    await expect(page.getByText('Cannot access exali.com')).toBeVisible();
    await expect(page.getByText('Delays in processing')).toBeVisible();

    // Suggestion sections
    await expect(page.getByText('Add TOTP support')).toBeVisible();
    await expect(page.getByText('Add backoff')).toBeVisible();

    // "Marquer resolu" buttons — 2 for the unresolved items
    const resolveButtons = page.getByRole('button', { name: 'Marquer resolu' });
    await expect(resolveButtons).toHaveCount(2);

    // Dossier link button — first amelioration has dossierId
    await expect(page.getByRole('button', { name: /Dossier: exali-rapport/ })).toBeVisible();
  });
});

test.describe('E2E-APP-18: Filter buttons Ouverts/Resolus', () => {
  test('"Ouverts" shows unresolved, "Resolus" shows resolved', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/ameliorations');

    // Default: Ouverts — 2 items
    await expect(page.getByText('MFA TOTP exali')).toBeVisible();
    await expect(page.getByText('Rate limit Gmail')).toBeVisible();
    await expect(page.getByText('Old issue fixed')).not.toBeVisible();

    // Switch to Resolus
    await page.getByRole('button', { name: 'Resolus' }).click();

    // Only resolved item
    await expect(page.getByText('Old issue fixed')).toBeVisible();
    await expect(page.getByText('MFA TOTP exali')).not.toBeVisible();
    await expect(page.getByText('Rate limit Gmail')).not.toBeVisible();

    // No "Marquer resolu" button for resolved items
    await expect(page.getByRole('button', { name: 'Marquer resolu' })).not.toBeVisible();
  });
});
