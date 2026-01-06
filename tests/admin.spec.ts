import { test, expect } from '@playwright/test';

test.describe('Admin Management', () => {

    test('Manage Categories', async ({ page }) => {
        await page.goto('/admin/categories');

        // Create (Inline Form)
        await page.fill('input[placeholder="e.g. Snacks, Merch..."]', 'TestCat');

        // Select stock option (multi-select)
        // Buttons are styled like +1, +4 etc.
        const plusOne = page.locator('button:has-text("+1")');
        // It might be already selected by default (code says [1]).
        // Let's just create it with default.

        await page.click('button:has-text("Create Category")');

        // Verify
        await expect(page.locator('table')).toContainText('TestCat');

        // Delete
        // Find row with TestCat and click delete
        const row = page.locator('tr', { hasText: 'TestCat' });
        page.on('dialog', dialog => dialog.accept());
        await row.locator('button', { hasText: 'Delete' }).click();

        // Verify
        await expect(page.locator('table')).not.toContainText('TestCat');
    });

    test('Manage Products', async ({ page }) => {
        await page.goto('/admin/products');

        // Create "TestBrew" (Modal)
        await page.click('button:has-text("Add New Product")');

        // Modal is open
        const modal = page.locator('div[style*="position: fixed"]');

        // Fill Name (first input in modal)
        await modal.locator('input').first().fill('TestBrew');

        // Set Type to Beer (assuming it exists, otherwise Liquor)
        // Select is first select element
        const select = modal.locator('select').first();
        // Check available options first? "Liquor" is default. "Beer" should exist from seed
        await select.selectOption({ label: 'Beer' });

        // Cost
        await modal.locator('input[type="number"]').first().fill('5.00'); // Cost

        // Initial Qty
        await modal.locator('input[type="number"]').nth(1).fill('10'); // Qty

        await modal.locator('button:has-text("Create Product")').click();

        // Verify
        const row = page.locator('tr', { hasText: 'TestBrew' });
        await expect(row).toContainText('Beer');
        await expect(row).toContainText('$5.00');
        // Verify stock
        await expect(row).toContainText('10');


        // Delete
        page.on('dialog', dialog => dialog.accept());
        await row.locator('button', { hasText: 'Delete' }).click();

        // Verify
        await expect(page.locator('table')).not.toContainText('TestBrew');
    });

    test('Manage Users', async ({ page }) => {
        await page.goto('/admin/users');

        // Create (Inline Form)
        // Inputs: First Name, Last Name, PIN
        // They are inside a form. Let's scope to form.
        const form = page.locator('form');

        await form.locator('input').nth(0).fill('Test'); // First Name
        await form.locator('input').nth(1).fill('User'); // Last Name
        await form.locator('input').nth(2).fill('1234'); // PIN

        await page.click('button:has-text("Create User")');

        // Verify (Users are in cards or table? Code says table inside card)
        const row = page.locator('tr', { hasText: 'Test User' });
        await expect(row).toBeVisible();

        // Delete
        page.on('dialog', dialog => dialog.accept());
        await row.locator('button', { hasText: 'Delete' }).click();

        // Verify
        await expect(page.locator('table')).not.toContainText('Test User');
    });

});
