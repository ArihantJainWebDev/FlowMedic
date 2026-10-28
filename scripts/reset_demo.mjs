/**
 * FlowMedic Demo Reset Script
 * Restores destination database schema to clean state for live rehearsal or judging.
 */

import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Load environment variables from .env.local if present
const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...vals] = trimmed.split("=");
    if (key && vals.length) {
      process.env[key.trim()] = vals.join("=").trim();
    }
  }
}

const dbUrl = process.env.DATABASE_URL?.trim();
if (!dbUrl) {
  console.error("Error: DATABASE_URL is not set in environment or .env.local.");
  process.exit(1);
}

const sql = neon(dbUrl);

console.log("Connecting to database and running demo reset...");

try {
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'github_issues' AND column_name = 'title'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'github_issues' AND column_name = 'issue_title'
      ) THEN
        ALTER TABLE github_issues RENAME COLUMN title TO issue_title;
      END IF;
    END $$;
  `;

  console.log("✓ Reset complete: 'title' column restored to 'issue_title'.");
  console.log("✓ FlowMedic demo schema is in a pristine, healthy state ready for sync.");
} catch (error) {
  console.error("Demo reset failed:", error);
  process.exit(1);
}

