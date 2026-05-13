// failure-hub/playwright/fixture.ts
import { test as base } from "@playwright/test";

const SENSITIVE_KEY_PATTERN = /password|token|auth|secret|credential/i;

function redactStorageKeys(keys: string[]): string[] {
  return keys.map((k) => (SENSITIVE_KEY_PATTERN.test(k) ? "***REDACTED***" : k));
}

export const test = base.extend<{
  failureHubLogs: string[];
}>({
  failureHubLogs: [
    async ({ page }, use, testInfo) => {
      const logs: string[] = [];

      // Capture all console messages
      page.on("console", (msg) => {
        logs.push(`[console:${msg.type()}] ${msg.text()}`);
      });

      // Capture hard network failures (CORS, offline, aborted)
      page.on("requestfailed", (request) => {
        logs.push(`[requestfailed] ${request.method()} ${request.url()}`);
      });

      // Capture HTTP 4xx / 5xx errors
      page.on("response", (response) => {
        if (!response.ok()) {
          logs.push(
            `[http-error:${response.status()}] ${response.request().method()} ${response.url()}`
          );
        }
      });

      await use(logs);

      // Only collect forensic evidence on failure
      if (testInfo.status !== testInfo.expectedStatus) {

        // --- DOM Snapshot (browser-crash-safe) ---
        try {
          const html = await page.content();
          testInfo.annotations.push({ type: "domHtml", description: html });
        } catch {
          // Browser was killed (SIGKILL / crash) — skip silently
        }

        // --- Viewport + Browser metadata ---
        try {
          const viewport = page.viewportSize();
          if (viewport) {
            testInfo.annotations.push({
              type: "viewport",
              description: `${viewport.width}x${viewport.height}`,
            });
          }
          testInfo.annotations.push({
            type: "browserName",
            description: testInfo.project.name,
          });
        } catch {
          // Ignore if context is already closed
        }

        // --- Storage Key Forensics (browser-crash-safe, keys only, redacted) ---
        try {
          const storageKeys = await page.evaluate(() => ({
            localStorage: Object.keys(localStorage),
            sessionStorage: Object.keys(sessionStorage),
          }));
          const redacted = {
            localStorage: redactStorageKeys(storageKeys.localStorage),
            sessionStorage: redactStorageKeys(storageKeys.sessionStorage),
          };
          testInfo.annotations.push({
            type: "storageKeys",
            description: JSON.stringify(redacted),
          });
        } catch {
          // Browser context closed or storage unavailable — skip silently
        }

        // --- Tag Extraction (from annotations and title) ---
        try {
          const tagAnnotations = testInfo.annotations
            .filter((a) => a.type === "tag" && a.description)
            .map((a) => a.description as string);

          const titleTags = (testInfo.title.match(/@[\w-]+/g) || []);
          const allTags = [...new Set([...tagAnnotations, ...titleTags])];

          if (allTags.length > 0) {
            testInfo.annotations.push({
              type: "tags",
              description: JSON.stringify(allTags),
            });
          }
        } catch {
          // Ignore
        }

        // --- Browser Logs Attachment (browser-crash-safe) ---
        try {
          await testInfo.attach("browser-logs", {
            body: logs.join("\n"),
            contentType: "text/plain",
          });
        } catch {
          // Ignore
        }
      }
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";