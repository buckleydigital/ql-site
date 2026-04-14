-- ============================================================
-- Migration: add missing columns to pilot_orders
-- Run this in the Supabase SQL Editor if the table was created
-- before these columns were added to schema.sql.
-- All statements are safe to re-run (IF NOT EXISTS).
-- ============================================================

alter table public.pilot_orders
    add column if not exists delivery_email    text,
    add column if not exists delivery_phone    text,
    add column if not exists stripe_session_id text unique,
    add column if not exists discount_code     text,
    add column if not exists discount_amount   numeric(10, 2) default 0,
    add column if not exists intake_first_name text,
    add column if not exists intake_last_name  text,
    add column if not exists intake_company    text,
    add column if not exists intake_phone      text,
    add column if not exists lead_type         text,
    add column if not exists lead_subtype      jsonb,
    add column if not exists service_postcode  text,
    add column if not exists service_radius    text;
