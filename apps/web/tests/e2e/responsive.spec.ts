// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mock-api';

test.describe('E2E-APP-19: Mobile bottom tab bar', () => {
  test('mobile shows bottom tab bar, hides desktop nav', async ({ page }, testInfo) => {
    if (testInfo.project.name !== 'mobile') {
      test.skip();
      return;
    }

    await setupMockApi(page);
    await page.goto('/');

    // Mobile bottom tab bar with 5 tabs
    const mobileNav = page.locator('nav.md\\:hidden');
    await expect(mobileNav).toBeVisible();

    // Tab labels
    await expect(mobileNav.getByText('Home')).toBeVisible();
    await expect(mobileNav.getByText('Dossiers')).toBeVisible();
    await expect(mobileNav.getByText('Nouveau')).toBeVisible();
    await expect(mobileNav.getByText('Terminal')).toBeVisible();
    await expect(mobileNav.getByText('Plus')).toBeVisible();

    // Desktop nav is hidden
    const desktopNav = page.locator('nav.hidden.md\\:flex');
    await expect(desktopNav).not.toBeVisible();
  });
});

test.describe('E2E-APP-20: Desktop left icon rail', () => {
  test('desktop shows left nav rail, hides mobile nav', async ({ page }, testInfo) => {
    if (testInfo.project.name !== 'desktop') {
      test.skip();
      return;
    }

    await setupMockApi(page);
    await page.goto('/');

    // Desktop nav rail — visible nav with NavLink elements
    const desktopNav = page.locator('nav.hidden.md\\:flex');
    await expect(desktopNav).toBeVisible();

    // NavLinks by their title attributes
    await expect(desktopNav.locator('a[title="Home"]')).toBeVisible();
    await expect(desktopNav.locator('a[title="Dossiers"]')).toBeVisible();
    await expect(desktopNav.locator('a[title="Terminal"]')).toBeVisible();
    await expect(desktopNav.locator('a[title="Ameliorations"]')).toBeVisible();

    // Avatar "L" at the bottom
    await expect(desktopNav.getByText('L', { exact: true })).toBeVisible();

    // Mobile nav is hidden
    const mobileNav = page.locator('nav.md\\:hidden');
    await expect(mobileNav).not.toBeVisible();
  });
});