import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Reasons eligible for auto-resolve at Tier 1 (below 10% dispute rate)
const AUTO_RESOLVE_REASONS = ["out_of_area", "duplicate"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-customer-email",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Parse a radius string like "50km" into a numeric km value.
 * Returns null if the format is unrecognised.
 */
function parseRadiusKm(radiusStr: string | null | undefined): number | null {
  if (!radiusStr) return null;
  const match = radiusStr.match(/^(\d+(?:\.\d+)?)\s*km$/i);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Approximate distance between two Australian postcodes using a simple
 * lookup of postcode → lat/lng.  Because the edge function runs in Deno
 * without access to a full geocoding API, we estimate using the numeric
 * postcode difference as a rough proxy (each postcode step ≈ 1.1 km in
 * metro areas, much more in rural areas).
 *
 * A proper implementation would call a geocoding service; this heuristic
 * errs on the side of caution — if we cannot determine the distance we
 * return null so the dispute goes to under_review.
 */
function estimatePostcodeDistanceKm(
  postcodeA: string | null | undefined,
  postcodeB: string | null | undefined,
): number | null {
  if (!postcodeA || !postcodeB) return null;
  const a = parseInt(postcodeA, 10);
  const b = parseInt(postcodeB, 10);
  if (isNaN(a) || isNaN(b)) return null;
  // Rough heuristic: average ~1.1 km per postcode step in Australian metro areas
  return Math.abs(a - b) * 1.1;
}

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
      .select("id, order_id, phone, buyer_email, postcode")
      .eq("id", lead_id)
      .eq("buyer_email", customerEmail)
      .maybeSingle();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found or access denied" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Calculate the customer's current dispute rate ────────────
    // Dispute rate = (disputes where status != 'rejected') / total leads received
    const [totalLeadsResult, nonRejectedDisputesResult] = await Promise.all([
      supabase
        .from("pilot_leads")
        .select("id", { count: "exact", head: true })
        .eq("buyer_email", customerEmail),
      supabase
        .from("lead_disputes")
        .select("id", { count: "exact", head: true })
        .eq("buyer_email", customerEmail)
        .neq("status", "rejected"),
    ]);

    const totalLeads = totalLeadsResult.count ?? 0;
    const nonRejectedDisputes = nonRejectedDisputesResult.count ?? 0;
    const disputeRate = totalLeads > 0 ? (nonRejectedDisputes / totalLeads) * 100 : 0;

    // ── Determine tier and dispute outcome ───────────────────────
    let disputeStatus: "resolved" | "under_review" = "under_review";
    let resolutionType: "auto" | null = null;
    let flagType: "warning" | "delivery_paused" | null = null;

    if (disputeRate >= 20) {
      // Tier 3 — at or above 20%: under_review + delivery_paused flag
      disputeStatus = "under_review";
      flagType = "delivery_paused";
    } else if (disputeRate >= 10) {
      // Tier 2 — between 10% and 20%: under_review + warning flag
      disputeStatus = "under_review";
      flagType = "warning";
    } else {
      // Tier 1 — below 10%: auto-resolve eligible reasons with verification
      if (reason === "duplicate") {
        // Verify: same phone, same order, different lead ID
        let duplicateVerified = false;
        if (lead.phone && lead.order_id) {
          const { data: dupes } = await supabase
            .from("pilot_leads")
            .select("id")
            .eq("buyer_email", customerEmail)
            .eq("order_id", lead.order_id)
            .eq("phone", lead.phone)
            .neq("id", lead_id);

          duplicateVerified = dupes != null && dupes.length > 0;
        }
        disputeStatus = duplicateVerified ? "resolved" : "under_review";
        resolutionType = duplicateVerified ? "auto" : null;
      } else if (reason === "out_of_area") {
        // Verify: fetch service_postcode & service_radius from pilot_orders,
        // compare with lead postcode
        let outsideConfirmed = false;
        if (lead.order_id) {
          const { data: order } = await supabase
            .from("pilot_orders")
            .select("service_postcode, service_radius")
            .eq("id", lead.order_id)
            .maybeSingle();

          if (order && order.service_postcode && order.service_radius && lead.postcode) {
            const radiusKm = parseRadiusKm(order.service_radius);
            const distanceKm = estimatePostcodeDistanceKm(order.service_postcode, lead.postcode);
            if (radiusKm != null && distanceKm != null) {
              outsideConfirmed = distanceKm > radiusKm;
            }
          }
        }
        disputeStatus = outsideConfirmed ? "resolved" : "under_review";
        resolutionType = outsideConfirmed ? "auto" : null;
      } else {
        // unreachable, wrong_type, no_intent, other — always under_review
        disputeStatus = "under_review";
      }
    }

    // ── Insert the dispute ──────────────────────────────────────
    const { data: dispute, error: disputeError } = await supabase
      .from("lead_disputes")
      .insert({
        lead_id: lead_id,
        buyer_email: customerEmail,
        reason: reason,
        notes: notes || null,
        status: disputeStatus,
        resolution_type: resolutionType,
        resolved_at: disputeStatus === "resolved" ? new Date().toISOString() : null,
      })
      .select("id, status, resolution_type")
      .single();

    if (disputeError) {
      return new Response(
        JSON.stringify({ error: disputeError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Insert buyer flag if Tier 2 or Tier 3 ───────────────────
    if (flagType) {
      const { error: flagError } = await supabase
        .from("buyer_flags")
        .upsert(
          {
            buyer_email: customerEmail,
            flag_type: flagType,
            dispute_rate_at_flag: Math.round(disputeRate * 10) / 10,
          },
          { onConflict: "buyer_email" },
        );

      if (flagError) {
        console.warn("Could not insert buyer flag:", flagError.message);
      }
    }

    const autoResolved = disputeStatus === "resolved";

    return new Response(
      JSON.stringify({
        dispute_id: dispute.id,
        status: disputeStatus,
        resolution_type: resolutionType,
        auto_resolved: autoResolved,
        message: autoResolved
          ? "Dispute noted and logged."
          : "Dispute submitted for review.",
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
