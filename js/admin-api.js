// /js/admin-api.js
// Admin-only helpers that talk to Supabase.
// Imported by /js/admin-dashboard.js

import { supabase } from "./config.js";

/* -----------------------------------------
   Approve / Reject users
----------------------------------------- */
export async function approveUser(id) {
  return await supabase
    .from("site_users")
    .update({ status: "approved" })
    .eq("id", id);
}

export async function rejectUser(id) {
  return await supabase
    .from("site_users")
    .update({ status: "rejected" })
    .eq("id", id);
}

/* -----------------------------------------
   Override handle (admin only)
----------------------------------------- */
export async function overrideHandle(id, newValue) {
  return await supabase
    .from("site_users")
    .update({ moderated_handle: newValue })
    .eq("id", id);
}

/* -----------------------------------------
   League membership admin controls
   (canonical payment + confirmation live
    on league_members, not site_users)
----------------------------------------- */

// Update payment_status in league_members
export async function setLeaguePaymentStatus(memberRowId, status) {
  return await supabase
    .from("league_members")
    .update({ payment_status: status })
    .eq("id", memberRowId);
}

// Update confirmed flag in league_members
export async function setLeagueConfirmed(memberRowId, confirmed) {
  return await supabase
    .from("league_members")
    .update({ confirmed })
    .eq("id", memberRowId);
}

// Remove league_members row
export async function removeLeagueMemberRow(memberRowId) {
  return await supabase
    .from("league_members")
    .delete()
    .eq("id", memberRowId);
}