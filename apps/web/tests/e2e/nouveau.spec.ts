// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.describe('E2E-APP-15: New job form', () => {
  test('displays form elements and submits POST on Lancer', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/nouveau');

    // Page title
    await expect(page.getByRole('heading', { name: 'Nouveau job' })).toBeVisible();

    // Textarea with placeholder
    const textarea = page.getByPlaceholder(/Ex:/);
    await expect(textarea).toBeVisible();

    // Confirm checkbox
    await expect(page.getByLabel('Valider avant actions externes')).toBeVisible();

    // Fichiers button
    await expect(page.getByRole('button', { name: 'Fichiers' })).toBeVisible();

    // Lancer button (initially disabled since no text)
    const lancerButton = page.getByRole('button', { name: 'Lancer' });
    await expect(lancerButton).toBeVisible();
    await expect(lancerButton).toBeDisabled();

    // Type instruction
    await textarea.fill('Genere la facture de mars 2026');
    await expect(lancerButton).toBeEnabled();

    // Intercept POST /api/job
    const requestPromise = page.waitForRequest(
      (req) =>
        req.url().includes('/api/job') &&
        req.method() === 'POST' &&
        !req.url().includes('/instruction') &&
        !req.url().includes('/resume') &&
        !req.url().includes('/upload'),
    );

    await lancerButton.click();
    const request = await requestPromise;
    const body = request.postDataJSON();
    expect(body.instruction).toBe('Genere la facture de mars 2026');
    expect(body.confirm).toBe(false);
  });

  test('sends confirm=true when checkbox is checked', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/nouveau');

    const textarea = page.getByPlaceholder(/Ex:/);
    await textarea.fill('Test avec confirm');

    await page.getByLabel('Valider avant actions externes').check();

    const requestPromise = page.waitForRequest(
      (req) =>
        req.url().includes('/api/job') &&
        req.method() === 'POST' &&
        !req.url().includes('/instruction'),
    );

    await page.getByRole('button', { name: 'Lancer' }).click();
    const request = await requestPromise;
    const body = request.postDataJSON();
    expect(body.confirm).toBe(true);
  });
});

test.describe('E2E-APP-16: Suggestions shown below the form', () => {
  test('displays suggestions section with recommendation cards', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/nouveau');

    // Recommendations section header
    await expect(page.getByText("Recommandations de l'assistant")).toBeVisible();

    // Suggestion cards
    await expect(page.getByText('Tax Filing Follow-up')).toBeVisible();
    await expect(page.getByText('Timesheet June')).toBeVisible();
    await expect(page.getByText('Car Insurance')).toBeVisible();
  });

  test('no suggestions section when suggestions are empty', async ({ page }) => {
    await setupMockApi(page, { suggestions: [] });
    await page.goto('/nouveau');

    await expect(page.getByText("Recommandations de l'assistant")).not.toBeVisible();
  });
});