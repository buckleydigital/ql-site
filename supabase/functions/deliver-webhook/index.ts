import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1s, 2s, 4s exponential backoff

async function fireWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>,
  attempt: number,
): Promise<{ statusCode: number; body: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const body = await resp.text().catch(() => "");
    return { statusCode: resp.status, body: body.slice(0, 1000) };
  } catch (_fetchErr) {
    clearTimeout(timeout);
    return { statusCode: 0, body: "Connection failed or timed out" };
  }
}

async function deliverWithRetry(
  webhookUrl: string,
  payload: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  customerEmail: string,
  leadId: string | null,
  orderId: string | null,
): Promise<{ success: boolean; statusCode: number; attempts: number }> {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 1) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }

    const result = await fireWebhook(webhookUrl, payload, attempt);
    lastStatus = result.statusCode;

    // Log the delivery attempt
    await supabase.from("webhook_delivery_log").insert({
      customer_email: customerEmail,
      lead_id: leadId,
      order_id: orderId,
      webhook_url: webhookUrl,
      status_code: result.statusCode,
      attempt: attempt,
      response_body: result.body,
    }).catch((err: Error) => console.error(`Failed to log webhook delivery for ${customerEmail} lead=${leadId}:`, err.message));

    // Success: 2xx
    if (result.statusCode >= 200 && result.statusCode < 300) {
      // Update customer_settings with last fired info
      await supabase
        .from("customer_settings")
        .update({
          webhook_last_fired: new Date().toISOString(),
          webhook_last_status: result.statusCode,
        })
        .eq("customer_email", customerEmail)
        .catch((err: Error) => console.error("Failed to update webhook status:", err));

      return { success: true, statusCode: result.statusCode, attempts: attempt };
    }
  }

  // All retries failed - update status with failure
  await supabase
    .from("customer_settings")
    .update({
      webhook_last_fired: new Date().toISOString(),
      webhook_last_status: lastStatus,
    })
    .eq("customer_email", customerEmail)
    .catch((err: Error) => console.error("Failed to update webhook status:", err));

  return { success: false, statusCode: lastStatus, attempts: MAX_RETRIES };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const { lead_id, order_id, customer_email } = await req.json();
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get customer's webhook URL
    const { data: settings } = await supabase
      .from("customer_settings")
      .select("webhook_url")
      .eq("customer_email", customer_email)
      .maybeSingle();

    if (!settings?.webhook_url) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "No webhook URL configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get lead data
    const { data: lead } = await supabase
      .from("pilot_leads")
      .select("*")
      .eq("id", lead_id)
      .maybeSingle();

    if (!lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get order data
    const { data: order } = await supabase
      .from("pilot_orders")
      .select("*")
      .eq("id", order_id)
      .maybeSingle();

    // Build webhook payload
    const payload = {
      event: "lead.delivered",
      timestamp: new Date().toISOString(),
      order_id: order_id || null,
      lead: {
        first_name: lead.first_name || "",
        last_name: lead.last_name || "",
        email: lead.email || "",
        phone: lead.phone || "",
        postcode: lead.postcode || "",
        niche: lead.lead_type || lead.type || "",
        fields: lead.survey_responses || {},
      },
      business: {
        company: order?.intake_company || "",
        owner_email: customer_email,
      },
    };

    const result = await deliverWithRetry(
      settings.webhook_url,
      payload,
      supabase,
      customer_email,
      lead_id,
      order_id,
    );

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Error in deliver-webhook:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
