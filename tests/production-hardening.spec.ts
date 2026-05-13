// tests/production-hardening.spec.ts
// Torture-test suite for the Failure-Hub Forensic Observability Tool.
// All scenarios are intentional failures designed to stress-test the pipeline.
import { test, expect } from "@failure-hub/playwright/fixture";

// ---------------------------------------------------------------------------
// Scenario A — Mega-DOM (5 MB HTML → Gzip truncation safety valve)
// ---------------------------------------------------------------------------
test.describe("Scenario A — Mega-DOM Truncation", () => {
  test("should survive a 5 MB DOM without crashing the runner", async ({ page }) => {
    // Build a ~5 MB HTML string
    const chunk = "<div class='row'>Feature A test data: " + "x".repeat(500) + "</div>\n";
    const megaDom = `<html><body>${chunk.repeat(10_000)}</body></html>`;

    await page.setContent(megaDom);

    // Attach the huge DOM so the reporter sees it
    test.info().annotations.push({ type: "domHtml", description: megaDom });

    // Intentionally fail to trigger the forensic pipeline
    expect(await page.title()).toBe("This title does not exist — intentional failure");
  });
});

// ---------------------------------------------------------------------------
// Scenario B — Dead Browser (SIGKILL simulation)
// ---------------------------------------------------------------------------
test.describe("Scenario B — Dead Browser Survival", () => {
  test("should still upload stack trace even when browser context is closed mid-test", async ({
    page,
    context,
  }) => {
    await page.setContent(`
      <html>
        <head><title>Feature A</title></head>
        <body><h1>Feature A Page</h1></body>
      </html>
    `);

    // Simulate browser crash by closing the context before the fixture teardown
    await context.close();

    // Intentionally fail — the fixture's crash-safe guards must handle the closed context
    expect(true).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario C — Parallel Flood (20 concurrent failures, 0ms delay)
// ---------------------------------------------------------------------------
test.describe.configure({ mode: "parallel" });

test.describe("Scenario C — Parallel Flood", () => {
  for (let i = 1; i <= 20; i++) {
    test(`Concurrent failure #${i}`, async ({ page }) => {
      await page.setContent(`
        <html>
          <head><title>Feature ${i}</title></head>
          <body>
            <h1>Feature ${i}</h1>
            <p>Parallel flood test — worker slot ${i}</p>
          </body>
        </html>
      `);

      // Intentional failure to trigger the forensic pipeline
      expect(await page.title()).toBe(`Non-existent title ${i} — intentional failure`);
    });
  }
});
