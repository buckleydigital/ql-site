import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@13.11.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

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
    const { lead_count, customer_email, client_reference_id, success_url, cancel_url } =
      await req.json();

    const priceId = PRICE_MAP[String(lead_count)];
    if (!priceId) {
      return new Response(
        JSON.stringify({ error: "Invalid lead_count. Must be 10, 25, or 50." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "payment",
      allow_promotion_codes: true,
      success_url: success_url || "https://quoteleads.com.au/pilot-confirmed",
      cancel_url: cancel_url || "https://quoteleads.com.au/pilot-checkout",
      customer_email: customer_email || undefined,
      client_reference_id: client_reference_id || undefined,
    });

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
