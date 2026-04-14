import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@13.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Reverse map: Stripe price ID → lead count (mirrors create-checkout-session)
const PRICE_TO_LEADS: Record<string, number> = {
  "price_1TLop5GDfpSvNOmBGwLGotyg": 10,
  "price_1TLpCcGDfpSvNOmBsSazf71k": 25,
  "price_1TLpD9GDfpSvNOmBifhrmf4L": 50,
};

const DEFAULT_LEAD_COUNT = 10;

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Anon key is auto-injected by Supabase and used for the non-admin resetPasswordForEmail call
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
// Site URL for the password-reset redirect. Set SITE_URL in Edge Function secrets.
const siteUrl = Deno.env.get("SITE_URL") ?? "https://quoteleads.com.au";

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

    // Try matching by stripe_session_id first (most reliable — set during
    // the create-checkout-session flow). Fall back to email + pending for
    // orders created before this change.
    let matchedCount = 0;

    const { data: sessionMatchData, error: sessionError } = await supabase
      .from("pilot_orders")
      .update({
        payment_status: "paid",
        amount_paid: amountPaid,
      })
      .eq("stripe_session_id", session.id)
      .eq("payment_status", "pending")
      .select("id");

    if (sessionError) {
      console.error("Supabase update (by session) failed:", sessionError);
    } else {
      matchedCount = sessionMatchData?.length ?? 0;
    }

    // Fallback: match by email + pending (for legacy orders without
    // a pre-set stripe_session_id)
    if (matchedCount === 0) {
      const { data: emailMatchData, error: emailError } = await supabase
        .from("pilot_orders")
        .update({
          payment_status: "paid",
          amount_paid: amountPaid,
          stripe_session_id: session.id,
        })
        .eq("email", customerEmail)
        .eq("payment_status", "pending")
        .select("id");

      if (emailError) {
        console.error("Supabase update (by email) failed:", emailError);
        return new Response(`Database update failed: ${emailError.message}`, {
          status: 500,
        });
      }
      matchedCount = emailMatchData?.length ?? 0;
    }

    if (matchedCount > 0) {
      console.log(
        `Updated ${matchedCount} pilot_orders for ${customerEmail}: paid $${amountPaid}, session ${session.id}`,
      );
    } else {
      // No pending row existed — this happens when the create-checkout-session
      // insert failed (e.g. missing DB columns in production). Insert a paid
      // order now so the record is never lost.
      console.warn(
        `No pending pilot_orders found for ${customerEmail} (session ${session.id}). Attempting direct insert.`,
      );

      // Check if a paid row already exists (e.g. webhook fired twice)
      const { data: existing } = await supabase
        .from("pilot_orders")
        .select("id")
        .eq("stripe_session_id", session.id)
        .maybeSingle();

      if (existing) {
        console.log(`Order already paid for session ${session.id}, skipping insert.`);
      } else {
        // Retrieve expanded session to infer lead_count from the Stripe price
        let leadCount = DEFAULT_LEAD_COUNT;
        try {
          const expanded = await stripe.checkout.sessions.retrieve(session.id, {
            expand: ["line_items"],
          });
          const priceId = expanded.line_items?.data?.[0]?.price?.id;
          if (priceId && PRICE_TO_LEADS[priceId] !== undefined) {
            leadCount = PRICE_TO_LEADS[priceId];
          } else {
            console.warn(
              `Unknown or missing price ID "${priceId ?? "none"}" for session ${session.id}. Defaulting to ${DEFAULT_LEAD_COUNT} leads.`,
            );
          }
        } catch (expandErr) {
          console.error("Failed to retrieve session line_items:", expandErr);
        }

        const { error: insertError } = await supabase
          .from("pilot_orders")
          .insert({
            email: customerEmail,
            lead_count: leadCount,
            payment_status: "paid",
            amount_paid: amountPaid,
            stripe_session_id: session.id,
          });

        if (insertError) {
          console.error("Failed to insert paid order:", insertError);
        } else {
          console.log(
            `Inserted paid order for ${customerEmail}: $${amountPaid}, ${leadCount} leads, session ${session.id}`,
          );
        }
      }
    }

    // Create auth user for the customer (skip if already exists)
    const tempPassword = crypto.randomUUID();

    const { data: newUser, error: createError } =
      await supabase.auth.admin.createUser({
        email: customerEmail,
        password: tempPassword,
        email_confirm: true,
        app_metadata: { account_type: "lead_buyer" },
      });

    if (createError) {
      if (
        createError.message?.toLowerCase().includes("already") ||
        createError.message?.toLowerCase().includes("exists")
      ) {
        console.log(`Auth user already exists for ${customerEmail}, stamping account_type`);
        // Ensure existing users also carry the lead_buyer account_type so they
        // cannot access internal dashboards that gate on this metadata field.
        // Use the admin REST endpoint filtered by email to avoid fetching all users.
        const lookupResp = await fetch(
          `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(customerEmail)}`,
          {
            headers: {
              Authorization: `Bearer ${supabaseServiceRoleKey}`,
              apikey: supabaseServiceRoleKey,
            },
          },
        );
        const lookupJson = await lookupResp.json();
        const existingUser = lookupJson?.users?.[0];
        if (existingUser?.id) {
          const { error: updateError } = await supabase.auth.admin.updateUserById(
            existingUser.id,
            { app_metadata: { account_type: "lead_buyer" } },
          );
          if (updateError) {
            console.error("Failed to stamp account_type on existing user:", updateError);
          } else {
            console.log(`Stamped account_type=lead_buyer on existing user ${existingUser.id}`);
          }
        }
      } else {
        console.error("Failed to create auth user:", createError);
      }
    } else {
      console.log(`Created auth user for ${customerEmail}: ${newUser?.user?.id}`);
    }

    // Send a password reset email so the customer can set their own password.
    // We use the anon client (not service role) so Supabase sends its built-in
    // templated email. SUPABASE_ANON_KEY is auto-injected in edge functions.
    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);
    const { error: resetError } = await supabaseAnon.auth.resetPasswordForEmail(
      customerEmail,
      { redirectTo: siteUrl + "/reset-password" },
    );

    if (resetError) {
      console.error("Failed to send password reset email:", resetError);
    } else {
      console.log(`Password reset email sent to ${customerEmail}`);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
