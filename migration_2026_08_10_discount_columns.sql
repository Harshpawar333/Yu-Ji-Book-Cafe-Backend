-- =============================================================
-- Migration: 2026-08-10 — Discount columns
-- =============================================================
-- Adds discount_percent and discount_amount to orders table
-- and ensures customer-level discount tracking exists.
-- Safe to re-run (uses IF NOT EXISTS).
-- =============================================================

-- 1. orders table — discount tracking per order
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount  NUMERIC DEFAULT 0;

-- 2. external_orders table — same columns for parity
ALTER TABLE external_orders
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount  NUMERIC DEFAULT 0;

-- 3. customers table — cumulative discount given (already exists, kept for reference)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS total_discount_given NUMERIC DEFAULT 0;

-- 4. Backfill nulls to 0 (in case existing rows have NULLs)
UPDATE orders         SET discount_percent = 0 WHERE discount_percent IS NULL;
UPDATE orders         SET discount_amount  = 0 WHERE discount_amount  IS NULL;
UPDATE external_orders SET discount_percent = 0 WHERE discount_percent IS NULL;
UPDATE external_orders SET discount_amount  = 0 WHERE discount_amount  IS NULL;
UPDATE customers      SET total_discount_given = 0 WHERE total_discount_given IS NULL;

-- 5. Add NOT NULL constraints with defaults (optional safety)
ALTER TABLE orders
  ALTER COLUMN discount_percent SET DEFAULT 0,
  ALTER COLUMN discount_amount  SET DEFAULT 0;

ALTER TABLE external_orders
  ALTER COLUMN discount_percent SET DEFAULT 0,
  ALTER COLUMN discount_amount  SET DEFAULT 0;

ALTER TABLE customers
  ALTER COLUMN total_discount_given SET DEFAULT 0;

-- 6. membership_plans — per-plan max discount superadmin can configure
ALTER TABLE membership_plans
  ADD COLUMN IF NOT EXISTS max_discount_percent NUMERIC DEFAULT 0;

UPDATE membership_plans SET max_discount_percent = 0 WHERE max_discount_percent IS NULL;

-- Done
