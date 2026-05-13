import { test, expect } from "@failure-hub/playwright/fixture";
import type { Page } from "@playwright/test";

const BASE_URL = "https://opensource-demo.orangehrmlive.com/web/index.php/auth/login";

test.describe("OrangeHRM Real-World Scenarios", () => {
  // Helper for login
  async function login(page: Page) {
    await page.goto(BASE_URL);
    await page.fill('input[name="username"]', "Admin");
    await page.fill('input[name="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard/index");
  }

  test("1. Login with valid credentials", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.fill('input[name="username"]', "Admin");
    await page.fill('input[name="password"]', "admin123");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test("2. Login with invalid credentials - INTENTIONAL FAIL", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.fill('input[name="username"]', "Admin");
    await page.fill('input[name="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    // Intentionally fail by expecting dashboard URL
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 3000 });
  });

  test("3. Forgot Password link navigation", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('.orangehrm-login-forgot p');
    await expect(page).toHaveURL(/.*requestPasswordResetCode/);
  });

  test("4. Dashboard visibility after login", async ({ page }) => {
    await login(page);
    await expect(page.locator('.oxd-topbar-header-breadcrumb')).toHaveText('Dashboard');
  });

  test("5. Navigate to Admin panel - INTENTIONAL FAIL", async ({ page }) => {
    await login(page);
    await page.click('text=Admin');
    // Intentionally fail by checking for non-existent text
    await expect(page.locator('.oxd-topbar-header-breadcrumb')).toHaveText('Super Admin Panel', { timeout: 3000 });
  });

  test("6. Add a new System User", async ({ page }) => {
    await login(page);
    await page.click('text=Admin');
    await page.click('button:has-text("Add")');
    await expect(page).toHaveURL(/.*saveSystemUser/);
  });

  test("7. Search for existing System User - INTENTIONAL FAIL", async ({ page }) => {
    await login(page);
    await page.click('text=Admin');
    await page.fill('label:has-text("Username") >> .. >> .. >> input', "Admin");
    await page.click('button:has-text("Search")');
    // Intentional fail: look for a missing result
    await expect(page.locator('.oxd-table-card')).toHaveCount(100, { timeout: 3000 });
  });

  test("8. Navigate to PIM panel", async ({ page }) => {
    await login(page);
    await page.click('text=PIM');
    await expect(page.locator('.oxd-topbar-header-breadcrumb')).toHaveText('PIM');
  });

  test("9. Add an Employee - INTENTIONAL FAIL", async ({ page }) => {
    await login(page);
    await page.click('text=PIM');
    await page.click('text=Add Employee');
    await page.fill('input[name="firstName"]', "John");
    await page.fill('input[name="lastName"]', "Doe");
    // Intentional fail: wait for an element that does not exist on this page
    await page.waitForSelector('.success-toast-message-that-does-not-exist', { timeout: 3000 });
  });

  test("10. Search for an Employee", async ({ page }) => {
    await login(page);
    await page.click('text=PIM');
    await page.fill('label:has-text("Employee Name") >> .. >> .. >> input', "a");
    await page.click('button:has-text("Search")');
    await expect(page.locator('.oxd-table')).toBeVisible();
  });

  test("11. Navigate to Leave panel - INTENTIONAL FAIL", async ({ page }) => {
    await login(page);
    await page.click('text=Leave');
    // Intentional fail
    await expect(page.locator('.oxd-topbar-header-breadcrumb')).toHaveText('Vacation', { timeout: 3000 });
  });

  test("12. Apply for Leave", async ({ page }) => {
    await login(page);
    await page.click('text=Leave');
    await page.click('text=Apply');
    await expect(page).toHaveURL(/.*applyLeave/);
  });

  test("13. Navigate to Time panel - INTENTIONAL FAIL", async ({ page }) => {
    await login(page);
    await page.click('text=Time');
    // Intentional fail
    const title = await page.title();
    expect(title).toBe("Time Tracking Pro"); 
  });

  test("14. View Timesheets", async ({ page }) => {
    await login(page);
    await page.click('text=Time');
    await page.click('text=Timesheets');
    await expect(page.locator('.oxd-table')).toBeVisible();
  });

  test("15. Navigate to Recruitment panel - INTENTIONAL FAIL", async ({ page }) => {
    await login(page);
    await page.click('text=Recruitment');
    // Intentional fail: timeout waiting for button
    await page.click('button:has-text("Hire Now")', { timeout: 3000 });
  });

  test("16. View Candidates", async ({ page }) => {
    await login(page);
    await page.click('text=Recruitment');
    await expect(page.locator('.oxd-table')).toBeVisible();
  });

  test("17. Navigate to My Info panel - INTENTIONAL FAIL", async ({ page }) => {
    await login(page);
    await page.click('text=My Info');
    // Intentional fail
    await expect(page.locator('.oxd-topbar-header-title')).toContainText('Top Secret Info', { timeout: 3000 });
  });

  test("18. Edit Personal Details", async ({ page }) => {
    await login(page);
    await page.click('text=My Info');
    // Adding a small delay to ensure the page is loaded
    await page.waitForTimeout(2000); 
    await expect(page.locator('form').first()).toBeVisible();
  });

  test("19. Navigate to Performance panel - INTENTIONAL FAIL", async ({ page }) => {
    await login(page);
    await page.click('text=Performance');
    // Intentional fail: Network error simulation isn't direct, so we'll just fail an assertion
    expect(true).toBe(false);
  });

  test("20. Logout flow", async ({ page }) => {
    await login(page);
    await page.click('.oxd-userdropdown-tab');
    await page.click('text=Logout');
    await expect(page).toHaveURL(/.*login/);
  });
});
