// /js/db.js
import { supabase } from "./config.js";

export async function getProfile() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth || !auth.user) return null;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", auth.user.id)
    .maybeSingle();

  return data;
}
