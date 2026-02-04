import { test as setup, expect } from '@playwright/test';

const authFile = '.auth/admin.json';

setup('authenticate as admin', async ({ page }) => {
    // Login with initial Admin seed data
    // Navigate to login page
    await page.goto('/login');

    // Wait for the user to manually log in and be redirected to a dashboard
    // This allows manual entry of Email/Password or PIN without script fragility.
    console.log('Waiting for manual login... Please log in in the browser window.');

    // Wait for any authorized page (inventory, admin, super-admin)
    await page.waitForURL(/.*(\/inventory|\/admin\/dashboard|\/super-admin).*/, { timeout: 0 });

    console.log('Login detected. Saving session state...');

    await page.context().storageState({ path: authFile });
});
