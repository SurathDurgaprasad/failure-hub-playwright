import { test, expect } from '@failure-hub/playwright/fixture';

test.describe.configure({ mode: 'parallel' });

const Scenarios = [
  { id: 1, color: 'bg-red-500', name: 'Auth Failure', secret: 'password123' },
  { id: 2, color: 'bg-blue-500', name: 'Checkout Crash', secret: 'token_abc123' },
  { id: 3, color: 'bg-green-500', name: 'Search Timeout', secret: 'authorization_bearer' },
  { id: 4, color: 'bg-yellow-500', name: 'Profile Error', secret: 'super_secret' },
  { id: 5, color: 'bg-purple-500', name: 'Network Drop', secret: 'admin_password' }
];

for (const scenario of Scenarios) {
  test(`Scenario ${scenario.id} - ${scenario.name}`, async ({ page }) => {
    // Generate a unique, heavy DOM to test compression
    const heavyDom = Array.from({ length: 500 }).map((_, i) => `<div class="p-2 border border-gray-200">Element ${i} - ${scenario.name}</div>`).join('');

    // Inject DOM and trigger console/network logs
    await page.setContent(`
      <html>
        <head>
          <style> body { font-family: sans-serif; } </style>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="p-8 ${scenario.color}">
          <h1 class="text-4xl text-white font-bold mb-8">Forensic Test ${scenario.id}</h1>
          <div class="hidden" id="secret">my password is ${scenario.secret}</div>
          <div class="hidden" id="token">authorization: token123</div>
          <div class="grid grid-cols-4 gap-4 bg-white/90 p-4 rounded-xl shadow-lg">
            ${heavyDom}
          </div>
          <!-- heavy SVG to test sanitization -->
          <svg width="400" height="400">
            <circle cx="200" cy="200" r="100" fill="red" />
          </svg>
          <!-- heavy base64 image to test sanitization -->
          <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" />
          <script>
            console.log('User logged in. Session token: ${scenario.secret}');
            console.error('Fatal exception in component render');
            // Mock a failing request
            fetch('https://httpstat.us/500').catch(() => {});
          </script>
        </body>
      </html>
    `);

    // Give it a moment to render and execute scripts
    await page.waitForTimeout(500);

    // Intentionally fail the test to trigger the forensic capture
    expect(await page.locator('h1').textContent()).toBe('Non-existent title to trigger failure');
  });
}
