-- ============================================================
-- Migration: Dashboard features
-- Adds columns/tables for campaign status, lead outcomes,
-- auto-resolve disputes, webhook delivery, notification prefs,
-- and lead audit trail.
-- ============================================================

-- 1. Campaign status on pilot_orders
ALTER TABLE pilot_orders
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'configuring'
    CHECK (status IN ('configuring','active','delivering','complete')),
  ADD COLUMN IF NOT EXISTS leads_delivered integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_completion date;

-- Backfill defaults for any existing rows
UPDATE pilot_orders SET status = 'configuring' WHERE status IS NULL;
UPDATE pilot_orders SET leads_delivered = 0 WHERE leads_delivered IS NULL;

-- Now add NOT NULL constraints
ALTER TABLE pilot_orders ALTER COLUMN status SET NOT NULL;
ALTER TABLE pilot_orders ALTER COLUMN leads_delivered SET NOT NULL;

-- 2. Auto-resolve: add resolution metadata to lead_disputes
ALTER TABLE lead_disputes
  ADD COLUMN IF NOT EXISTS resolution_type text
    CHECK (resolution_type IN ('auto','manual')),
  ADD COLUMN IF NOT EXISTS replacement_lead_id uuid REFERENCES pilot_leads(id),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- 3. Lead outcome tracking on pilot_leads
ALTER TABLE pilot_leads
  ADD COLUMN IF NOT EXISTS outcome text
    CHECK (outcome IN ('won','booked','no_answer','not_interested')),
  ADD COLUMN IF NOT EXISTS outcome_updated_at timestamptz;

-- 4. Lead audit trail columns on pilot_leads
ALTER TABLE pilot_leads
  ADD COLUMN IF NOT EXISTS ad_source text,
  ADD COLUMN IF NOT EXISTS submission_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS survey_responses jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS consent_record text,
  ADD COLUMN IF NOT EXISTS phone_verification_status text
    CHECK (phone_verification_status IN ('verified','unverified','failed'));

-- 5. Customer settings table (webhook + notification preferences)
CREATE TABLE IF NOT EXISTS customer_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email text NOT NULL UNIQUE,
  webhook_url text,
  webhook_last_fired timestamptz,
  webhook_last_status integer,
  notification_lead_delivery text NOT NULL DEFAULT 'both'
    CHECK (notification_lead_delivery IN ('sms','email','both')),
  notification_order_status text NOT NULL DEFAULT 'both'
    CHECK (notification_order_status IN ('sms','email','both')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS for customer_settings: customers can only see/edit their own row
ALTER TABLE customer_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_settings_select ON customer_settings
  FOR SELECT USING (customer_email = auth.jwt() ->> 'email');

CREATE POLICY customer_settings_insert ON customer_settings
  FOR INSERT WITH CHECK (customer_email = auth.jwt() ->> 'email');

CREATE POLICY customer_settings_update ON customer_settings
  FOR UPDATE USING (customer_email = auth.jwt() ->> 'email');

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_customer_settings_email ON customer_settings(customer_email);

-- 6. Webhook delivery log
CREATE TABLE IF NOT EXISTS webhook_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email text NOT NULL,
  lead_id uuid REFERENCES pilot_leads(id),
  order_id uuid REFERENCES pilot_orders(id),
  webhook_url text NOT NULL,
  status_code integer,
  attempt integer NOT NULL DEFAULT 1,
  response_body text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE webhook_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_log_select ON webhook_delivery_log
  FOR SELECT USING (customer_email = auth.jwt() ->> 'email');

-- Add order_id to pilot_leads if not exists (links lead to order)
ALTER TABLE pilot_leads
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES pilot_orders(id);

-- Update pilot_orders status based on leads_delivered vs lead_count
-- This function can be called by a trigger or cron
CREATE OR REPLACE FUNCTION update_order_status()
RETURNS trigger AS $$
BEGIN
  -- When a lead is inserted for an order, increment leads_delivered
  UPDATE pilot_orders
  SET
    leads_delivered = leads_delivered + 1,
    status = CASE
      WHEN leads_delivered + 1 >= lead_count THEN 'complete'
      WHEN leads_delivered + 1 > 0 THEN 'delivering'
      ELSE status
    END
  WHERE id = NEW.order_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: auto-update order status when a lead is delivered
DROP TRIGGER IF EXISTS trg_lead_delivered ON pilot_leads;
CREATE TRIGGER trg_lead_delivered
  AFTER INSERT ON pilot_leads
  FOR EACH ROW
  WHEN (NEW.order_id IS NOT NULL)
  EXECUTE FUNCTION update_order_status();
