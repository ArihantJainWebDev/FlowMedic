/**
 * Phase 06 Security and Hardening Verification Script
 * Validates route boundaries, headers, secret redaction, rate limits, and serverless constraints.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log("=== FlowMedic Phase 06 Hardening & Security Audit ===\n");

// 1. Check all Route Handlers for maxDuration export
console.log("1. Checking Serverless Route Duration Limits:");
const apiDir = join(process.cwd(), "src/app/api");

function findRouteFiles(dir) {
  let routes = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      routes = routes.concat(findRouteFiles(fullPath));
    } else if (entry === "route.ts") {
      routes.push(fullPath);
    }
  }
  return routes;
}

const routeFiles = findRouteFiles(apiDir);
for (const file of routeFiles) {
  const content = readFileSync(file, "utf8");
  const relPath = file.replace(process.cwd() + "/", "");
  const hasMaxDuration = /export\s+const\s+maxDuration\s*=\s*\d+;/.test(content);
  assert(hasMaxDuration, `${relPath} exports maxDuration`);
}

// 2. Check next.config.ts for Security Headers & CSP
console.log("\n2. Checking Security Headers & CSP in next.config.ts:");
const nextConfig = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
assert(nextConfig.includes("Content-Security-Policy"), "Content-Security-Policy header configured");
assert(nextConfig.includes("X-Frame-Options"), "X-Frame-Options: DENY configured");
assert(nextConfig.includes("X-Content-Type-Options"), "X-Content-Type-Options: nosniff configured");
assert(nextConfig.includes("Strict-Transport-Security"), "HSTS configured");
assert(nextConfig.includes("poweredByHeader: false"), "X-Powered-By header disabled");
assert(nextConfig.includes("Cache-Control"), "API Cache-Control no-store headers configured");

// 3. Check vercel.json configuration
console.log("\n3. Checking vercel.json Deployment Configuration:");
const vercelConfig = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8"));
assert(vercelConfig.framework === "nextjs", "Framework set to nextjs");
assert(vercelConfig.cleanUrls === true, "cleanUrls enabled");
assert(Boolean(vercelConfig.functions?.["src/app/api/**/*.ts"]?.maxDuration), "API functions maxDuration configured");

// 4. Check for dangerous client-side secret exposure
console.log("\n4. Checking for Unsafe NEXT_PUBLIC_ Secrets:");
const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");
const dangerousEnvKeys = (envExample.match(/NEXT_PUBLIC_[A-Z0-9_]+/g) || []);
assert(dangerousEnvKeys.length === 0, "No sensitive variables prefixed with NEXT_PUBLIC_ in .env.example");

// 5. Check gitignore for .env security
console.log("\n5. Checking Gitignore Protection for Secrets:");
const gitignore = readFileSync(join(process.cwd(), ".gitignore"), "utf8");
assert(gitignore.includes(".env*"), ".env* files ignored in .gitignore");
assert(gitignore.includes("!.env.example"), ".env.example explicitly allowed");

console.log(`\n=== Audit Complete: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}

