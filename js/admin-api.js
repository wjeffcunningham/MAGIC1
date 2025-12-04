// /js/admin-api.js
import { supabase } from "/js/config.js";

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