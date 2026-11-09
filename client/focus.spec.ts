// Playwright test: Team Task Calendar input focus bug
// Run with: npx playwright test focus.spec.ts
// Before the fix: FAILS (input loses focus after every keystroke)
// After the fix:  PASSES (continuous typing works)

import { test, expect } from '@playwright/test';

test('Add new task modal: continuous typing in Title field keeps focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/team-task-calendar');

  // Click "New Task" button to open the modal
  await page.getByRole('button', { name: /New Task/ }).click();

  // Wait for modal to appear
  await expect(page.getByRole('dialog', { name: 'Create New Task' })).toBeVisible();

  // Click the Title input
  const titleInput = page.getByLabel('Title *');
  await titleInput.click();

  // Type a full title in one go
  await titleInput.fill('Quarterly review meeting');

  // Assert: input still has focus
  const focusedElement = await page.evaluate(() => document.activeElement?.tagName + ':' + document.activeElement?.getAttribute('id') + ':' + document.activeElement?.getAttribute('name'));
  expect(focusedElement).toContain('INPUT');

  // Assert: full text was entered (not truncated to one character)
  const value = await titleInput.inputValue();
  expect(value).toBe('Quarterly review meeting');
});

test('Edit Task modal: continuous typing in Title field keeps focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/team-task-calendar');

  // First create a task so there's something to edit
  await page.getByRole('button', { name: /New Task/ }).click();
  await page.getByLabel('Title *').fill('TestTask');
  await page.getByRole('button', { name: 'Create Task' }).click();
  await page.getByRole('dialog', { name: 'Create New Task' }).waitFor({ state: 'hidden' });

  // Open the task detail modal and click Edit
  await page.getByText('TestTask').first().click();
  await page.getByRole('button', { name: /Edit/ }).click();

  const titleInput = page.getByLabel('Title *');
  await titleInput.click();
  await titleInput.fill('Updated Quarterly review meeting');

  const focusedElement = await page.evaluate(() => document.activeElement?.tagName + ':' + document.activeElement?.getAttribute('id'));
  expect(focusedElement).toContain('INPUT');

  const value = await titleInput.inputValue();
  expect(value).toBe('Updated Quarterly review meeting');
});

test('Description field: continuous typing keeps focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/team-task-calendar');

  await page.getByRole('button', { name: /New Task/ }).click();
  await expect(page.getByRole('dialog', { name: 'Create New Task' })).toBeVisible();

  const descInput = page.getByLabel('Description');
  await descInput.click();
  await descInput.fill('This is a full description sentence with multiple words.');

  const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
  expect(focusedElement).toContain('TEXTAREA');

  const value = await descInput.inputValue();
  expect(value).toBe('This is a full description sentence with multiple words.');
});

test('Save and Cancel still work after fix', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/team-task-calendar');

  await page.getByRole('button', { name: /New Task/ }).click();
  await page.getByLabel('Title *').fill('TestSave');
  await page.getByRole('button', { name: 'Create Task' }).click();

  // Modal should close and task should appear
  await expect(page.getByRole('dialog', { name: 'Create New Task' })).not.toBeVisible();
  await expect(page.getByText('TestSave')).toBeVisible();

  // Test Cancel
  await page.getByRole('button', { name: /New Task/ }).click();
  await page.getByLabel('Title *').fill('WillCancel');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog', { name: 'Create New Task' })).not.toBeVisible();
  await expect(page.getByText('WillCancel')).not.toBeVisible();
});
