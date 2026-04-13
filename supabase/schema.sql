-- ============================================================
-- QuoteLeads — Supabase Schema
-- Run this in the Supabase SQL Editor to set up all tables,
-- indexes, and Row Level Security policies.
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";


-- ────────────────────────────────────────────────────────────
-- TABLE: pilot_orders
-- Created when a buyer completes the Market Pulse checkout.
-- Updated to payment_status = 'paid' by the stripe-webhook
-- Edge Function on checkout.session.completed.
-- ────────────────────────────────────────────────────────────
create table if not exists public.pilot_orders (
    id                  uuid primary key default uuid_generate_v4(),
    created_at          timestamptz not null default now(),

    -- Buyer identity
    email               text not null,          -- intake/account email
    delivery_email      text,                   -- email leads are forwarded to
    delivery_phone      text,                   -- phone leads are forwarded to

    -- Order details
    lead_count          int not null default 10,
    payment_status      text not null default 'pending'
                            check (payment_status in ('pending', 'paid', 'refunded')),
    amount_paid         numeric(10, 2),
    stripe_session_id   text unique,
    discount_code       text,
    discount_amount     numeric(10, 2) default 0,

    -- Intake snapshot (stored at purchase time)
    intake_first_name   text,
    intake_last_name    text,
    intake_company      text,
    intake_phone        text,
    lead_type           text,                   -- e.g. 'Solar', 'Roofing'
    lead_subtype        jsonb,                  -- e.g. ["Solar + Battery"]
    service_postcode    text,
    service_radius      text                    -- e.g. '50km'
);

-- Indexes
create index if not exists pilot_orders_email_idx          on public.pilot_orders (email);
create index if not exists pilot_orders_payment_status_idx on public.pilot_orders (payment_status);
create index if not exists pilot_orders_created_at_idx     on public.pilot_orders (created_at desc);

-- RLS
alter table public.pilot_orders enable row level security;

-- Authenticated buyers can only read their own orders
create policy "Buyers read own pilot_orders"
    on public.pilot_orders for select
    to authenticated
    using (email = (auth.jwt() ->> 'email'));


-- ────────────────────────────────────────────────────────────
-- TABLE: pilot_leads
-- Individual leads delivered to a buyer against an order.
-- Populated by the QuoteLeads fulfilment workflow (e.g. via
-- a Make.com automation or an admin insert).
-- ────────────────────────────────────────────────────────────
create table if not exists public.pilot_leads (
    id              uuid primary key default uuid_generate_v4(),
    created_at      timestamptz not null default now(),

    -- Link to order
    order_id        uuid references public.pilot_orders (id) on delete set null,
    buyer_email     text not null,              -- denormalised for easy RLS

    -- Lead contact details
    first_name      text,
    last_name       text,
    phone           text,
    email           text,
    suburb          text,
    postcode        text,
    state           text,

    -- Lead classification
    lead_type       text,                       -- e.g. 'Solar', 'Roofing'
    lead_subtype    text,                       -- e.g. 'Solar + Battery'
    project         text,                       -- project description / scope
    source          text,                       -- where the lead came from
    notes           text,                       -- additional context / job scope

    -- Status
    status          text not null default 'delivered'
                        check (status in ('delivered', 'disputed', 'replaced', 'invalid'))
);

-- Indexes
create index if not exists pilot_leads_buyer_email_idx  on public.pilot_leads (buyer_email);
create index if not exists pilot_leads_order_id_idx     on public.pilot_leads (order_id);
create index if not exists pilot_leads_created_at_idx   on public.pilot_leads (created_at desc);

-- RLS
alter table public.pilot_leads enable row level security;

-- Authenticated buyers can only read leads assigned to them
create policy "Buyers read own pilot_leads"
    on public.pilot_leads for select
    to authenticated
    using (buyer_email = (auth.jwt() ->> 'email'));


-- ────────────────────────────────────────────────────────────
-- TABLE: lead_disputes
-- Raised by a buyer when a lead does not meet the agreed
-- criteria. Reviewed by the QuoteLeads team.
-- ────────────────────────────────────────────────────────────
create table if not exists public.lead_disputes (
    id              uuid primary key default uuid_generate_v4(),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    -- Link to lead
    lead_id         uuid references public.pilot_leads (id) on delete cascade,
    buyer_email     text not null,

    -- Dispute details
    reason          text not null
                        check (reason in (
                            'unreachable',
                            'duplicate',
                            'out_of_area',
                            'wrong_type',
                            'no_intent',
                            'other'
                        )),
    notes           text,

    -- Resolution
    status          text not null default 'open'
                        check (status in ('open', 'under_review', 'resolved', 'rejected')),
    resolution_note text                        -- internal note from QuoteLeads team
);

-- Indexes
create index if not exists lead_disputes_lead_id_idx     on public.lead_disputes (lead_id);
create index if not exists lead_disputes_buyer_email_idx on public.lead_disputes (buyer_email);
create index if not exists lead_disputes_status_idx      on public.lead_disputes (status);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger lead_disputes_updated_at
    before update on public.lead_disputes
    for each row execute function public.set_updated_at();

-- RLS
alter table public.lead_disputes enable row level security;

-- Authenticated buyers can insert disputes for their own leads
create policy "Buyers can insert lead_disputes"
    on public.lead_disputes for insert
    to authenticated
    with check (buyer_email = (auth.jwt() ->> 'email'));

-- Authenticated buyers can read their own disputes
create policy "Buyers read own lead_disputes"
    on public.lead_disputes for select
    to authenticated
    using (buyer_email = (auth.jwt() ->> 'email'));


-- ────────────────────────────────────────────────────────────
-- VIEW: buyer_dispute_rates
-- Computes each buyer's dispute rate as
--   disputed_leads / total_delivered_leads.
-- Used as a reference for the thresholds enforced client-side:
--   < 10%  → healthy
--   10-20% → warning
--   ≥ 20%  → delivery paused (zero tolerance)
-- ────────────────────────────────────────────────────────────
create or replace view public.buyer_dispute_rates as
select
    pl.buyer_email,
    count(pl.id)                                        as total_leads,
    count(ld.id)                                        as disputed_leads,
    round(
        count(ld.id)::numeric / nullif(count(pl.id), 0) * 100,
        1
    )                                                   as dispute_rate_pct
from public.pilot_leads pl
left join public.lead_disputes ld
    on ld.lead_id = pl.id
    and ld.status <> 'resolved'
group by pl.buyer_email;


-- ────────────────────────────────────────────────────────────
-- TABLE: buyer_flags
-- Admin-managed table to record account-level flags
-- (e.g. delivery_paused when dispute rate exceeds 20%).
-- The buyer_dashboard reads this to show the correct status
-- even if disputes have since been resolved/removed.
-- ────────────────────────────────────────────────────────────
create table if not exists public.buyer_flags (
    id              uuid primary key default uuid_generate_v4(),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    buyer_email     text not null unique,

    -- Flag type: 'warning' | 'delivery_paused'
    flag_type       text not null
                        check (flag_type in ('warning', 'delivery_paused')),

    reason          text,                       -- internal admin note
    dispute_rate_at_flag numeric(5, 1)          -- rate % that triggered the flag
);

create index if not exists buyer_flags_email_idx on public.buyer_flags (buyer_email);

create trigger buyer_flags_updated_at
    before update on public.buyer_flags
    for each row execute function public.set_updated_at();

-- RLS
alter table public.buyer_flags enable row level security;

-- Buyers can only read their own flag
create policy "Buyers read own buyer_flags"
    on public.buyer_flags for select
    to authenticated
    using (buyer_email = (auth.jwt() ->> 'email'));


-- ────────────────────────────────────────────────────────────
-- NOTES FOR DEPLOYMENT
-- ────────────────────────────────────────────────────────────
-- 1. Run this entire script in: Supabase Dashboard → SQL Editor
-- 2. IMPORTANT — enable email confirmation in Supabase Auth settings
--    (Authentication → Providers → Email → "Confirm email" ON).
--    The RLS policies rely on email = jwt email; an unverified email
--    address could otherwise be used to access another buyer's data.
-- 3. The stripe-webhook Edge Function already writes to pilot_orders
--    using the service role key, so no anon insert policy is needed
--    for the webhook path.
-- 4. Add SITE_URL to the stripe-webhook Edge Function secrets:
--       supabase secrets set SITE_URL=https://quoteleads.com.au
--    This is the base URL used for the password-reset redirect link.
-- 5. The buyer-dashboard.html page uses the anon key + password
--    auth. After signIn, the JWT contains the verified email
--    which is matched by the RLS policies above.
-- 6. pilot_leads rows should be inserted by your fulfilment
--    automation (e.g. Make.com scenario) using the service role key.
-- 7. When a buyer's computed dispute rate exceeds 20%, insert a row
--    into buyer_flags (flag_type = 'delivery_paused') via the admin
--    panel or Make.com automation. The dashboard will reflect the
--    paused state immediately on next login.
-- 8. AUTH SETUP — required steps in Supabase Dashboard:
--    a) Authentication → Providers → Email → enable "Confirm email"
--    b) Authentication → URL Configuration → add these Redirect URLs:
--         https://quoteleads.com.au/reset-password
--         https://quoteleads.com.au/buyer-dashboard
--    c) Authentication → Email Templates → "Reset Password" template:
--       Update the link to point to https://quoteleads.com.au/reset-password
--    d) Authentication → Email Templates → "Confirm signup" (optional — 
--       buyers are created server-side with email_confirm:true so this
--       template is not triggered in the normal purchase flow)
-- 9. MIGRATION — if pilot_leads already exists, add the new columns:
--       ALTER TABLE public.pilot_leads ADD COLUMN IF NOT EXISTS project text;
--       ALTER TABLE public.pilot_leads ADD COLUMN IF NOT EXISTS source text;
-- ============================================================
