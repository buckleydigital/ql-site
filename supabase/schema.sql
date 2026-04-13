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

-- Anyone can insert a new order (intake → checkout flow)
create policy "Anyone can insert pilot_orders"
    on public.pilot_orders for insert
    to anon
    with check (true);

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
-- NOTES FOR DEPLOYMENT
-- ────────────────────────────────────────────────────────────
-- 1. Run this entire script in: Supabase Dashboard → SQL Editor
-- 2. The stripe-webhook Edge Function already writes to pilot_orders
--    using the service role key, so no anon insert policy is needed
--    for the webhook path.
-- 3. The buyer-dashboard.html page uses the anon key + magic link
--    auth. After signInWithOtp, the JWT contains the user's email
--    which is matched by the RLS policies above.
-- 4. pilot_leads rows should be inserted by your fulfilment
--    automation (e.g. Make.com scenario) using the service role key.
-- 5. To allow the service role to bypass RLS (default behaviour),
--    no additional policies are needed for service-role inserts.
-- ============================================================
