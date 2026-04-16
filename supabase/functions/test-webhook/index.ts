import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify the user
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { webhook_url } = await req.json();

    if (!webhook_url) {
      return new Response(
        JSON.stringify({ error: "webhook_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fire a sample payload
    const samplePayload = {
      event: "lead.delivered",
      timestamp: new Date().toISOString(),
      order_id: "ord_test_sample",
      lead: {
        first_name: "Sarah",
        last_name: "M",
        email: "sarah@example.com",
        phone: "+61412345678",
        postcode: "2155",
        niche: "solar",
        fields: {
          avg_electricity_bill: "$350/qtr",
          purchase_timeline: "Within 4 weeks",
          decision_maker: true,
        },
      },
      business: {
        company: "Your Company",
        owner_email: user.email,
      },
      _test: true,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let statusCode = 0;
    let responseBody = "";

    try {
      const resp = await fetch(webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(samplePayload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      statusCode = resp.status;
      responseBody = await resp.text().catch(() => "");
      responseBody = responseBody.slice(0, 500);
    } catch (_fetchErr) {
      clearTimeout(timeout);
      statusCode = 0;
      responseBody = "Connection failed or timed out";
    }

    const success = statusCode >= 200 && statusCode < 300;

    // Update customer_settings with test result
    const supabaseService = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await supabaseService
      .from("customer_settings")
      .update({
        webhook_last_fired: new Date().toISOString(),
        webhook_last_status: statusCode,
      })
      .eq("customer_email", user.email);

    return new Response(
      JSON.stringify({
        success,
        status_code: statusCode,
        response_preview: responseBody.slice(0, 200),
        message: success
          ? "Webhook test successful — your endpoint returned " + statusCode + "."
          : "Webhook test failed — your endpoint returned " + (statusCode || "no response") + ". Check the URL and try again.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Error in test-webhook:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
