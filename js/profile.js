// profile.js — NOT USED DIRECTLY BY profile.html ANYMORE
// But kept for modularity if you want to import later.

import { supabase, getLocalSession, saveLocalSession } from "./session.js";

export async function loadProfile() {
  const session = getLocalSession();
  if (!session) return null;

  const { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("id", session.playerId)
    .maybeSingle();

  return player;
}

export async function saveProfile(updates) {
  const session = getLocalSession();
  if (!session) return { error: "No session" };

  const { error } = await supabase
    .from("players")
    .update(updates)
    .eq("id", session.playerId);

  if (!error) {
    saveLocalSession({ ...session, ...updates });
  }

  return { error };
}