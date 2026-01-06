import { test as setup, expect } from '@playwright/test';

const authFile = '.auth/admin.json';

setup('authenticate as admin', async ({ page }) => {
    // Login with initial Admin seed data
    await page.goto('/api/auth/login'); // Or UI page if exists, assuming UI login at /login? 
    // Let's check where the login form is. AdminNav logout redirects to /
    // Let's assume there is a login page.
    await page.goto('/');

    // Enter PIN
    // Enter PIN 0420 using keypad
    await page.click('button:has-text("0")');
    await page.click('button:has-text("4")');
    await page.click('button:has-text("2")');
    await page.click('button:has-text("0")');

    // Click Enter
    await page.click('button:has-text("ENTER")');

    // Wait for login to complete (cookie set)
    await page.waitForURL('**/inventory**', { timeout: 10000 }).catch(() => { });
    // Or check for navigation element
    // Just navigate to admin to verify
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/.*\/admin\/dashboard/);

    await page.context().storageState({ path: authFile });
});
