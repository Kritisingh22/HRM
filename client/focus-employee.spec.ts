// Playwright test: Add Employee form focus bug (ResourceView)
// Run with: npx playwright test focus-employee.spec.ts
// Before the fix: FAILS (input loses focus after every keystroke)
// After the fix:  PASSES (continuous typing works)

import { test, expect } from '@playwright/test';

test('Add Employee modal: continuous typing in Full name keeps focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/employees');

  // Click "Add employee" button to open the modal
  await page.getByRole('button', { name: /Add employee/ }).click();

  // Wait for modal to appear
  await expect(page.getByRole('dialog', { name: 'Add record' })).toBeVisible();

  // Click the Full name input
  const nameInput = page.getByLabel('Full name');
  await nameInput.click();

  // Type a full name in one go
  await nameInput.fill('Aarav Sharma 2026');

  // Assert: input still has focus
  const focusedElement = await page.evaluate(() => document.activeElement?.tagName + ':' + document.activeElement?.getAttribute('id'));
  expect(focusedElement).toContain('INPUT');
  expect(focusedElement).toContain('rf-name');

  // Assert: full text was entered (not truncated to one character)
  const value = await nameInput.inputValue();
  expect(value).toBe('Aarav Sharma 2026');
});

test('Add Employee modal: continuous typing in Email field keeps focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/employees');

  await page.getByRole('button', { name: /Add employee/ }).click();
  await expect(page.getByRole('dialog', { name: 'Add record' })).toBeVisible();

  const emailInput = page.getByLabel('Work email');
  await emailInput.click();
  await emailInput.fill('aarav.sharma@cyethack.com');

  const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
  expect(focusedElement).toContain('INPUT');

  const value = await emailInput.inputValue();
  expect(value).toBe('aarav.sharma@cyethack.com');
});

test('Add Employee modal: Save still works after fix', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/employees');

  await page.getByRole('button', { name: /Add employee/ }).click();
  await page.getByLabel('Full name').fill('Test Employee');
  await page.getByLabel('Work email').fill('test@cyethack.com');
  await page.getByLabel('Joining date').fill('2026-01-15');
  await page.getByRole('button', { name: 'Add' }).click();

  // Modal should close and employee should appear
  await expect(page.getByRole('dialog', { name: 'Add record' })).not.toBeVisible();
  await expect(page.getByText('Test Employee')).toBeVisible();
});

test('Add Employee modal: Cancel still works after fix', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/employees');

  await page.getByRole('button', { name: /Add employee/ }).click();
  await page.getByLabel('Full name').fill('WillCancel');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog', { name: 'Add record' })).not.toBeVisible();
  await expect(page.getByText('WillCancel')).not.toBeVisible();
});
