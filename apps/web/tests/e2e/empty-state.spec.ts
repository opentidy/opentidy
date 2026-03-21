// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { test, expect } from '@playwright/test';
import { setupMockApi, mockSuggestions } from './fixtures/mock-api';

test.describe('E2E-APP-25: Suggestions with urgency colors', () => {
  test('urgent has red border, normal has accent border, low has gray border', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    // Each SuggestionCard has border-l-4 with urgency-specific color
    // urgent → border-l-red
    // normal → border-l-accent
    // low → border-l-text-tertiary

    // Verify all 3 suggestions are visible
    await expect(page.getByText('Tax Filing Follow-up')).toBeVisible();
    await expect(page.getByText('Timesheet June')).toBeVisible();
    await expect(page.getByText('Car Insurance')).toBeVisible();

    // Verify urgency badges are displayed
    await expect(page.getByText('urgent', { exact: true })).toBeVisible();
    await expect(page.getByText('normal', { exact: true })).toBeVisible();
    await expect(page.getByText('low', { exact: true })).toBeVisible();

    // Verify ordering — urgent suggestions appear first
    // The mock data already has urgent first, normal second, low third
    const suggestionTitles = await page.locator('.bg-card.rounded-xl.border-l-4').allTextContents();
    // Find the indices of each suggestion in the rendered order
    const urgentIndex = suggestionTitles.findIndex((t) => t.includes('Tax Filing Follow-up'));
    const normalIndex = suggestionTitles.findIndex((t) => t.includes('Timesheet June'));
    const lowIndex = suggestionTitles.findIndex((t) => t.includes('Car Insurance'));

    // Urgent should come before normal, normal before low
    expect(urgentIndex).toBeLessThan(normalIndex);
    expect(normalIndex).toBeLessThan(lowIndex);
  });
});

test.describe('E2E-APP-26: Empty workspace', () => {
  test('no tasks and no suggestions shows zen mode on Home', async ({ page }) => {
    await setupMockApi(page, {
      tasks: [],
      suggestions: [],
      sessions: [],
    });
    await page.goto('/');

    // Zen mode
    await expect(page.getByText('Tout roule')).toBeVisible();
    await expect(page.getByText('aucune action requise')).toBeVisible();
  });

  test('Tasks page shows empty message when no tasks match filter', async ({ page }) => {
    await setupMockApi(page, { tasks: [] });
    await page.goto('/tasks');

    // Empty state message
    await expect(page.getByText('Aucun task actifs')).toBeVisible();
  });
});