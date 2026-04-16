import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Dispute reasons that are automatically approved and queued for replacement
const AUTO_RESOLVE_REASONS = ["unreachable", "out_of_area", "duplicate"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-customer-email",
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

    const { lead_id, reason, notes } = await req.json();

    if (!lead_id || !reason) {
      return new Response(
        JSON.stringify({ error: "lead_id and reason are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Use the user's JWT to get their email, but service role for the actual operations
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const customerEmail = user.email!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Verify the lead belongs to this customer
    const { data: lead, error: leadError } = await supabase
      .from("pilot_leads")
      .select("id, order_id, phone, buyer_email")
      .eq("id", lead_id)
      .eq("buyer_email", customerEmail)
      .maybeSingle();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found or access denied" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const isAutoResolvable = AUTO_RESOLVE_REASONS.includes(reason);
    let duplicateVerified = false;

    // For duplicate reason, verify it's actually a duplicate (same phone, same order)
    if (reason === "duplicate" && lead.phone && lead.order_id) {
      const { data: dupes } = await supabase
        .from("pilot_leads")
        .select("id")
        .eq("buyer_email", customerEmail)
        .eq("order_id", lead.order_id)
        .eq("phone", lead.phone)
        .neq("id", lead_id);

      duplicateVerified = dupes != null && dupes.length > 0;
    }

    // For out_of_area, we trust the customer's report since they set their radius
    // For unreachable, we trust the customer's report on invalid/disconnected phones

    const shouldAutoResolve = isAutoResolvable && (reason !== "duplicate" || duplicateVerified);

    const disputeStatus = shouldAutoResolve ? "resolved" : "open";
    const resolutionType = shouldAutoResolve ? "auto" : null;

    // Insert the dispute
    const { data: dispute, error: disputeError } = await supabase
      .from("lead_disputes")
      .insert({
        lead_id: lead_id,
        buyer_email: customerEmail,
        reason: reason,
        notes: notes || null,
        status: disputeStatus,
        resolution_type: resolutionType,
        resolved_at: shouldAutoResolve ? new Date().toISOString() : null,
      })
      .select("id, status, resolution_type")
      .single();

    if (disputeError) {
      return new Response(
        JSON.stringify({ error: disputeError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // If auto-resolved, queue a replacement lead by incrementing the order's lead_count
    let replacementQueued = false;
    if (shouldAutoResolve && lead.order_id) {
      // Fetch current lead_count then update with incremented value
      const { data: currentOrder } = await supabase
        .from("pilot_orders")
        .select("lead_count")
        .eq("id", lead.order_id)
        .maybeSingle();

      if (currentOrder) {
        const { error: updateError } = await supabase
          .from("pilot_orders")
          .update({ lead_count: (currentOrder.lead_count || 0) + 1 })
          .eq("id", lead.order_id);

        if (updateError) {
          console.warn("Could not increment lead_count for replacement:", updateError.message);
        } else {
          replacementQueued = true;
        }
      }
    }

    return new Response(
      JSON.stringify({
        dispute_id: dispute.id,
        status: disputeStatus,
        resolution_type: resolutionType,
        auto_resolved: shouldAutoResolve,
        replacement_queued: replacementQueued,
        message: shouldAutoResolve
          ? "Dispute auto-approved. A replacement lead has been queued for your order."
          : "Dispute submitted for manual review. We'll review it within 2 business days.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Error in auto-resolve-dispute:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
