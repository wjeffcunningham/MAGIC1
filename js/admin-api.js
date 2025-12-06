// /js/admin-api.js
import { supabase } from "/js/config.js";

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
   Set payment status on site_users
----------------------------------------- */
export async function setPaymentStatus(id, status) {
  return await supabase
    .from("site_users")
    .update({ payment_status: status })
    .eq("id", id);
}

/* -----------------------------------------
   Remove league member row
----------------------------------------- */
export async function removeLeagueMemberRow(memberRowId) {
  return await supabase
    .from("league_members")
    .delete()
    .eq("id", memberRowId);
}