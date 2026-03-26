// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { test, expect } from '@playwright/test';
import { setupMockApi, mockTasks, mockSuggestions, mockSessions } from './fixtures/mock-api';

test.describe('E2E-APP-02: Home shows suggestions', () => {
  test('displays suggestion cards with urgency badges and action buttons', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    // Suggestions section header
    await expect(page.getByText('Suggestions', { exact: false })).toBeVisible();

    // 3 suggestion cards
    await expect(page.getByText('Tax Filing Follow-up')).toBeVisible();
    await expect(page.getByText('Timesheet June')).toBeVisible();
    await expect(page.getByText('Car Insurance')).toBeVisible();

    // "Create task" and "Ignore" buttons on each card
    const createButtons = page.getByRole('button', { name: 'Create task' });
    await expect(createButtons).toHaveCount(3);
    const ignoreButtons = page.getByRole('button', { name: 'Ignore' });
    await expect(ignoreButtons).toHaveCount(3);

    // Urgency badges
    await expect(page.getByText('urgent', { exact: true })).toBeVisible();
    await expect(page.getByText('normal', { exact: true })).toBeVisible();
    await expect(page.getByText('low', { exact: true })).toBeVisible();
  });
});

test.describe('E2E-APP-03: Home shows active sessions in "En fond" section', () => {
  test('displays session cards with status dots', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    // "En fond" section
    await expect(page.getByText('En fond', { exact: false })).toBeVisible();

    // 3 sessions: SessionCard shows capitalized task name
    await expect(page.getByText('Invoices Acme').nth(1)).toBeVisible();
    await expect(page.getByText('Insurance Report')).toBeVisible();
    await expect(page.getByText('Test Blocked')).toBeVisible();
  });
});

test.describe('E2E-APP-05: Home zen mode', () => {
  test('shows Tout roule when no suggestions, no sessions', async ({ page }) => {
    await setupMockApi(page, {
      tasks: [],
      suggestions: [],
      sessions: [],
    });
    await page.goto('/');

    await expect(page.getByText('Tout roule')).toBeVisible();
    await expect(page.getByText('aucune action requise')).toBeVisible();

    // Navigation buttons in zen mode
    await expect(page.getByRole('button', { name: 'Voir tous les tasks' })).toBeVisible();
    // "+ Nouveau task" appears in both Header (on desktop) and zen body
    await expect(page.getByRole('button', { name: '+ Nouveau task' }).last()).toBeVisible();
  });
});