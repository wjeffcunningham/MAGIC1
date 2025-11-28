import { supabase, getLocalSession, isAdmin } from "./session.js";

const adminCards = document.getElementById("admin-cards");
const notAdmin = document.getElementById("not-admin");

const pendingEl = document.getElementById("pending-count");
const matchEl = document.getElementById("match-count");
const seasonEl = document.getElementById("season-name");
const monthEl = document.getElementById("month-name");

main();

async function main() {
  const session = getLocalSession();
  if (!session) {
    notAdmin.classList.remove("hidden");
    return;
  }

  const admin = await isAdmin();
  if (!admin) {
    notAdmin.classList.remove("hidden");
    return;
  }

  adminCards.classList.remove("hidden");

  loadPendingPlayers();
  loadUnapprovedMatches();
  loadActiveSeasonMonth();
}

async function loadPendingPlayers() {
  const { data } = await supabase
    .from("players")
    .select("id")
    .eq("status", "pending");

  pendingEl.textContent = data?.length ?? 0;
}

async function loadUnapprovedMatches() {
  const { data } = await supabase
    .from("league_matches")
    .select("id")
    .eq("approved", false);

  matchEl.textContent = data?.length ?? 0;
}

async function loadActiveSeasonMonth() {
  const { data: season } = await supabase
    .from("league_seasons")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (!season) {
    seasonEl.textContent = "None";
    monthEl.textContent = "None";
    return;
  }

  seasonEl.textContent = season.name;

  const { data: month } = await supabase
    .from("league_months")
    .select("*")
    .eq("season_id", season.id)
    .eq("is_active", true)
    .maybeSingle();

  monthEl.textContent = month?.name || "—";
}