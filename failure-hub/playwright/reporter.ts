// failure-hub/playwright/reporter.ts
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { uploadFailureReport } from "../core/uploader";
import * as fs from "node:fs";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Sanitisation helpers
// ---------------------------------------------------------------------------

// Matches sensitive key + the value that follows (=value, :value, "key":"value" patterns)
const SENSITIVE_PATTERN = /(password|token|authorization|secret|credential)([\s:='"]+)([^\s&'">,\n}]{1,200})/gi;
// Matches full Authorization: Bearer <jwt> lines (multi-word values)
const AUTH_HEADER_PATTERN = /(authorization\s*:\s*)(bearer\s+[^\s,\n]{1,500})/gi;

function redactSensitive(str: string): string {
  if (!str) return str;
  return str
    .replace(AUTH_HEADER_PATTERN, "$1***REDACTED***")
    .replace(SENSITIVE_PATTERN, "$1$2***REDACTED***");
}

function sanitizeDom(html: string): string {
  if (!html) return html;
  const clean = html
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/data:image\/[^"']+/gi, "data:image/REDACTED");
  return redactSensitive(clean);
}

function stripAnsi(str: string): string {
  if (!str) return str;
  return str.replace(/\u001b\[[0-9;]*m/g, "");
}

// ---------------------------------------------------------------------------
// Environment context
// ---------------------------------------------------------------------------

function buildEnvContext(): Record<string, string | undefined> {
  const ciProvider = process.env.GITLAB_CI
    ? "GitLab CI"
    : process.env.GITHUB_ACTIONS
      ? "GitHub Actions"
      : process.env.CIRCLECI
        ? "CircleCI"
        : process.env.JENKINS_URL
          ? "Jenkins"
          : process.env.TF_BUILD
            ? "Azure DevOps"
            : "local";

  return {
    os: os.type(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    ciProvider,
  };
}

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

export default class FailureReporter implements Reporter {
  private endpoint: string;
  private envContext: Record<string, string | undefined>;

  constructor(options: { endpoint?: string } = {}) {
    this.endpoint = options.endpoint || process.env.FAILURE_HUB_ENDPOINT || "";
    this.envContext = buildEnvContext();
  }

  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    if (result.status !== "failed" && result.status !== "timedOut") return;

    // Silent operator: if no endpoint is configured, do nothing.
    if (!this.endpoint) return;

    let screenshotBase64 = "";
    let videoBase64 = "";
    let domHtml = "";
    let sourceCode = "";
    let logs = "";

    // --- Source code ---
    try {
      sourceCode = fs.readFileSync(test.location.file, "utf8");
    } catch {
      sourceCode = "Could not read source file.";
    }

    // --- Attachments ---
    const attachments = (result.attachments || [])
      .filter((a) => !a.name.endsWith(".zip") && a.contentType !== "application/zip")
      .filter((a) => a.path || a.body);

    for (const a of attachments) {
      if (a.name === "screenshot" || a.contentType?.startsWith("image/")) {
        try {
          const buf = a.path ? fs.readFileSync(a.path) : (a.body as Buffer);
          screenshotBase64 = buf.toString("base64");
        } catch {
          // File may have been cleaned up — skip
        }
      }

      if (a.name === "video" || a.contentType?.startsWith("video/")) {
        try {
          const buf = a.path ? fs.readFileSync(a.path) : (a.body as Buffer);
          videoBase64 = buf.toString("base64");
        } catch {
          // File may have been cleaned up — skip
        }
      }

      if (a.name === "browser-logs") {
        try {
          logs = a.path
            ? fs.readFileSync(a.path, "utf8")
            : (a.body as Buffer).toString("utf8");
        } catch {
          // Skip
        }
      }
    }

    // --- Annotations from fixture ---
    const getAnnotation = (type: string) =>
      test.annotations.find((a) => a.type === type)?.description ?? "";

    const domHtmlAnnotation = getAnnotation("domHtml");
    if (domHtmlAnnotation) domHtml = domHtmlAnnotation;

    const browserName = getAnnotation("browserName") || "unknown";
    const viewport = getAnnotation("viewport") || "unknown";

    let storageKeys: { localStorage: string[]; sessionStorage: string[] } | undefined;
    const storageAnnotation = getAnnotation("storageKeys");
    if (storageAnnotation) {
      try {
        storageKeys = JSON.parse(storageAnnotation);
      } catch {
        // Malformed — skip
      }
    }

    let tags: string[] = [];
    const tagsAnnotation = getAnnotation("tags");
    if (tagsAnnotation) {
      try {
        tags = JSON.parse(tagsAnnotation);
      } catch {
        // Malformed — skip
      }
    }

    // --- Sanitise ---
    domHtml = sanitizeDom(domHtml);
    logs = redactSensitive(logs);
    const cleanError = stripAnsi(result.error?.message || "");
    const cleanStack = stripAnsi(result.error?.stack || "");

    // --- Build payload ---
    const payload = {
      testName: test.title,
      file: test.location.file,
      line: test.location.line,
      column: test.location.column,
      titlePath: test.titlePath(),
      status: result.status,
      durationMs: result.duration,
      retry: result.retry,
      workerIndex: result.workerIndex,
      tags,
      error: cleanError,
      stack: cleanStack,
      stdout: result.stdout,
      stderr: result.stderr,
      sourceCode,
      screenshotBase64,
      videoBase64,
      domHtml,
      logs,
      storageKeys,
      timestamp: new Date().toISOString(),
      browserName,
      viewport,
      envContext: this.envContext,
    };

    await uploadFailureReport({ endpoint: this.endpoint, payload });
  }
}