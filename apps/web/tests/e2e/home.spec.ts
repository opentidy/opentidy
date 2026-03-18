import { test, expect } from '@playwright/test';
import { setupMockApi, mockDossiers, mockSuggestions, mockSessions } from './fixtures/mock-api';

test.describe('E2E-APP-02: Home shows suggestions', () => {
  test('displays suggestion cards with urgency badges and action buttons', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    // Suggestions section header
    await expect(page.getByText('Suggestions', { exact: false })).toBeVisible();

    // 3 suggestion cards
    await expect(page.getByText('Impots Chypre')).toBeVisible();
    await expect(page.getByText('Timesheet Juin')).toBeVisible();
    await expect(page.getByText('Assurance Auto')).toBeVisible();

    // "Creer le dossier" and "Ignorer" buttons on each card
    const createButtons = page.getByRole('button', { name: 'Creer le dossier' });
    await expect(createButtons).toHaveCount(3);
    const ignoreButtons = page.getByRole('button', { name: 'Ignorer' });
    await expect(ignoreButtons).toHaveCount(3);

    // Urgency badges
    await expect(page.getByText('urgent', { exact: true })).toBeVisible();
    await expect(page.getByText('normal', { exact: true })).toBeVisible();
    await expect(page.getByText('faible', { exact: true })).toBeVisible();
  });
});

test.describe('E2E-APP-03: Home shows active sessions in "En fond" section', () => {
  test('displays session cards with status dots', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    // "En fond" section
    await expect(page.getByText('En fond', { exact: false })).toBeVisible();

    // 3 sessions — SessionCard shows capitalized dossier name
    await expect(page.getByText('Factures Sopra').nth(1)).toBeVisible();
    await expect(page.getByText('Exali Rapport')).toBeVisible();
    await expect(page.getByText('Bloque Test')).toBeVisible();
  });
});

test.describe('E2E-APP-05: Home zen mode', () => {
  test('shows Tout roule when no suggestions, no sessions', async ({ page }) => {
    await setupMockApi(page, {
      dossiers: [],
      suggestions: [],
      sessions: [],
    });
    await page.goto('/');

    await expect(page.getByText('Tout roule')).toBeVisible();
    await expect(page.getByText('aucune action requise')).toBeVisible();

    // Navigation buttons in zen mode
    await expect(page.getByRole('button', { name: 'Voir tous les dossiers' })).toBeVisible();
    // "+ Nouveau dossier" appears in both Header (on desktop) and zen body
    await expect(page.getByRole('button', { name: '+ Nouveau dossier' }).last()).toBeVisible();
  });
});
