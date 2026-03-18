import { test, expect } from '@playwright/test';
import { setupMockApi, mockDossiers } from './fixtures/mock-api';

test.describe('E2E-APP-08: Dossier detail shows rendered state', () => {
  test('displays title, status badge, and objective', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/dossier/factures-sopra');

    // Title
    await expect(page.getByRole('heading', { name: 'Factures Sopra' })).toBeVisible();

    // Status badge — "En cours"
    await expect(page.getByText('En cours')).toBeVisible();

    // StateRenderer shows "Objectif" heading — visible in whichever viewport is active
    await expect(page.locator('h3:visible', { hasText: 'Objectif' })).toBeVisible();

    // Breadcrumb link
    await expect(page.getByText('Dossiers').first()).toBeVisible();
  });
});

test.describe('E2E-APP-10: Desktop sidebar shows session status and files', () => {
  test('sidebar displays session info and artifacts', async ({ page, browserName }, testInfo) => {
    // Sidebar is hidden on mobile
    if (testInfo.project.name === 'mobile') {
      test.skip();
      return;
    }

    await setupMockApi(page);
    await page.goto('/dossier/factures-sopra');

    // Session section in sidebar
    await expect(page.getByText('Session', { exact: true })).toBeVisible();

    // Session status label in sidebar — "Active - Xm" format
    await expect(page.getByText(/^Active - /)).toBeVisible();

    // Artifacts section — "Fichiers" heading in sidebar and artifact file
    await expect(page.getByText('Fichiers', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('facture-2025-04.pdf').first()).toBeVisible();
  });
});

test.describe('E2E-APP-11: Instruction bar', () => {
  test('can type instruction and click Envoyer to make POST request', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/dossier/factures-sopra');

    const instructionInput = page.getByPlaceholder('Donner une instruction a ce dossier...');
    await expect(instructionInput).toBeVisible();

    await instructionInput.fill('Relance le traitement SFTP');

    const sendButton = page.getByRole('button', { name: 'Envoyer' });
    await expect(sendButton).toBeEnabled();

    // Intercept the POST request
    const requestPromise = page.waitForRequest(
      (req) =>
        req.url().includes('/api/dossier/factures-sopra/instruction') &&
        req.method() === 'POST',
    );

    await sendButton.click();
    const request = await requestPromise;
    const body = request.postDataJSON();
    expect(body.instruction).toBe('Relance le traitement SFTP');
    expect(body.confirm).toBe(false);
  });
});

test.describe('E2E-APP-28: Instruction bar with confirm mode', () => {
  test('sends confirm flag when checkbox is checked', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/dossier/factures-sopra');

    const instructionInput = page.getByPlaceholder('Donner une instruction a ce dossier...');
    await instructionInput.fill('Envoie la facture par email');

    // Check the confirm checkbox
    const confirmCheckbox = page.getByLabel('Valider avant actions externes');
    await confirmCheckbox.check();

    // Intercept the POST
    const requestPromise = page.waitForRequest(
      (req) =>
        req.url().includes('/api/dossier/factures-sopra/instruction') &&
        req.method() === 'POST',
    );

    await page.getByRole('button', { name: 'Envoyer' }).click();
    const request = await requestPromise;
    const body = request.postDataJSON();
    expect(body.confirm).toBe(true);
  });
});
