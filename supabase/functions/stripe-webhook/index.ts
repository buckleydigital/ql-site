import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@13.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(`Webhook signature verification failed: ${err.message}`, {
      status: 400,
    });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const customerEmail = session.customer_email ?? session.customer_details?.email;

    if (!customerEmail) {
      console.error("No customer email found in checkout session:", session.id);
      return new Response("No customer email in session", { status: 400 });
    }

    const amountPaid = (session.amount_total ?? 0) / 100;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { error } = await supabase
      .from("pilot_orders")
      .update({
        payment_status: "paid",
        amount_paid: amountPaid,
        stripe_session_id: session.id,
      })
      .eq("email", customerEmail)
      .eq("payment_status", "pending");

    if (error) {
      console.error("Supabase update failed:", error);
      return new Response(`Database update failed: ${error.message}`, {
        status: 500,
      });
    }

    console.log(
      `Updated pilot_orders for ${customerEmail}: paid $${amountPaid}, session ${session.id}`,
    );
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
