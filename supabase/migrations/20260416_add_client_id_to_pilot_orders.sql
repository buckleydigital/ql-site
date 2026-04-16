-- ============================================================
-- Migration: add client_id to pilot_orders
-- Links Market Pulse orders to the internal clients record
-- once auto-created by the stripe-webhook edge function.
-- ============================================================

ALTER TABLE pilot_orders
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);
