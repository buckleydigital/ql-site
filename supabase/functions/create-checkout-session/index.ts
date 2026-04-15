import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@13.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PRICE_MAP: Record<string, string> = {
  "10": "price_1TLop5GDfpSvNOmBGwLGotyg",
  "25": "price_1TLpCcGDfpSvNOmBsSazf71k",
  "50": "price_1TLpD9GDfpSvNOmBifhrmf4L",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const {
      lead_count,
      customer_email,
      client_reference_id,
      success_url,
      cancel_url,
      // Order / intake fields for the pilot_orders insert
      delivery_email,
      delivery_phone,
      intake_first_name,
      intake_last_name,
      intake_company,
      intake_phone,
      lead_type,
      lead_subtype,
      service_postcode,
      service_radius,
      discount_code,
      discount_amount,
    } = await req.json();

    const priceId = PRICE_MAP[String(lead_count)];
    if (!priceId) {
      return new Response(
        JSON.stringify({ error: "Invalid lead_count. Must be 10, 25, or 50." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Create the Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "payment",
      allow_promotion_codes: true,
      success_url: success_url || "https://quoteleads.com.au/market-pulse-confirmed",
      cancel_url: cancel_url || "https://quoteleads.com.au/market-pulse-intake",
      customer_email: customer_email || undefined,
      client_reference_id: client_reference_id || undefined,
    });

    // 2. Insert a pending order into pilot_orders so the stripe-webhook can
    //    later mark it as paid. This was previously missing, causing orders
    //    to never appear in the database.
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const orderEmail = customer_email || delivery_email;
    if (orderEmail) {
      const { error: insertError } = await supabase
        .from("pilot_orders")
        .insert({
          email: orderEmail,
          delivery_email: delivery_email || null,
          delivery_phone: delivery_phone || null,
          lead_count: Number(lead_count) || 10,
          payment_status: "pending",
          stripe_session_id: session.id,
          discount_code: discount_code || null,
          discount_amount: discount_amount ? Number(discount_amount) : 0,
          intake_first_name: intake_first_name || null,
          intake_last_name: intake_last_name || null,
          intake_company: intake_company || null,
          intake_phone: intake_phone || null,
          lead_type: lead_type || null,
          lead_subtype: lead_subtype || null,
          service_postcode: service_postcode || null,
          service_radius: service_radius || null,
        });

      if (insertError) {
        console.error("Failed to insert pending order:", insertError);
        // Don't block checkout - the order can still be reconciled via the webhook
      } else {
        console.log(
          `Inserted pending order for ${orderEmail}, session ${session.id}`,
        );
      }
    }

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Error creating checkout session:", err);
    return new Response(
      JSON.stringify({ error: "Failed to create checkout session. Please try again." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
