-- DEMO RESET: Restores the demo database to a pristine healthy state.
-- Run this in the Neon SQL Editor or via scripts/reset_demo.mjs to reset before judge presentations.

DO $$
BEGIN
  -- 1. Safely restore the renamed column 'title' back to 'issue_title'
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

