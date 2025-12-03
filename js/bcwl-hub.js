// /js/bcwl-hub.js
import { supabase } from "./config.js";
import { getProfile } from "./db.js";

// Constants
const LEAGUE = "BCWL2026JAN";

// DOM elements
const notLogged     = document.getElementById("not-logged");
const hub           = document.getElementById("hub");
const userNameEl    = document.getElementById("user-name");
const joinBtn       = document.getElementById("join-btn");
const leaveBtn      = document.getElementById("leave-btn");
const joinStatusEl  = document.getElementById("join-status");
const adminSection  = document.getElementById("admin-section");
const pendingListEl = document.getElementById("pending-list");
const playerCountEl = document.getElementById("player-count");
const playerListEl  = document.getElementById("player-list");

let currentProfile = null;

// Helpers
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function waitForSupabaseAuth() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) return;
  return new Promise((resolve) => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          subscription.unsubscribe();
          resolve();
        }
      }
    );
  });
}

// Join / leave actions
async function joinLeague() {
  if (!currentProfile) {
    joinStatusEl.textContent = "Log in first.";
    return;
  }

  joinStatusEl.textContent = "Submitting…";

  const { error } = await supabase
    .from("league_signups")
    .insert({
      league: LEAGUE,
      user_id: currentProfile.id,
      approved: false
    });

  if (error) {
    // Likely unique violation if already signed up
    console.error("joinLeague error", error);
    joinStatusEl.textContent = error.message || "Error joining league.";
  } else {
    joinStatusEl.textContent = "Your signup is pending moderator approval.";
  }

  await refreshState();
}

async function leaveLeague() {
  if (!currentProfile) return;

  joinStatusEl.textContent = "Removing…";

  const { error } = await supabase
    .from("league_signups")
    .delete()
    .eq("league", LEAGUE)
    .eq("user_id", currentProfile.id);

  if (error) {
    console.error("leaveLeague error", error);
    joinStatusEl.textContent = error.message || "Error leaving league.";
  } else {
    joinStatusEl.textContent = "You are no longer signed up.";
  }

  await refreshState();
}

// Load current user's signup row
async function loadMySignup() {
  if (!currentProfile) return null;

  const { data, error } = await supabase
    .from("league_signups")
    .select("id, approved")
    .eq("league", LEAGUE)
    .eq("user_id", currentProfile.id)
    .maybeSingle();

  if (error) {
    console.error("loadMySignup error", error);
    return null;
  }

  return data || null;
}

// Approved players (everyone sees count; mods see names)
async function loadApprovedPlayers() {
  const { data, error } = await supabase
    .from("league_signups")
    .select(`
      id,
      user_id,
      approved,
      created_at,
      users:users!league_signups_user_id_fkey (name)
    `)
    .eq("league", LEAGUE)
    .eq("approved", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("loadApprovedPlayers error", error);
    playerListEl.innerHTML = "<div class='muted'>Error loading players.</div>";
    playerCountEl.textContent = "0";
    return;
  }

  const players = data.map(row => ({
    id: row.user_id,
    name: row.users?.name || "Player"
  }));

  playerCountEl.textContent = players.length.toString();

  if (!players.length) {
    playerListEl.innerHTML = "<div class='muted'>No approved players yet.</div>";
    return;
  }

  if (currentProfile?.is_mod) {
    playerListEl.innerHTML = players
      .map(p =>
        `<div class="list-row"><span>${escapeHtml(p.name)}</span></div>`
      )
      .join("");
  } else {
    playerListEl.innerHTML =
      "<div class='muted'>Player names are visible to moderators only.</div>";
  }
}

// Pending sign-ups (mods only)
async function loadPendingSignups() {
  if (!currentProfile?.is_mod) {
    pendingListEl.innerHTML =
      "<div class='muted'>Moderator tools.</div>";
    return;
  }

  const { data, error } = await supabase
    .from("league_signups")
    .select(`
      id,
      created_at,
      user_id,
      approved,
      users:users!league_signups_user_id_fkey (name, email)
    `)
    .eq("league", LEAGUE)
    .eq("approved", false)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("loadPendingSignups error", error);
    pendingListEl.innerHTML =
      "<div class='muted'>Error loading pending sign-ups.</div>";
    return;
  }

  if (!data.length) {
    pendingListEl.innerHTML =
      "<div class='muted'>No pending sign-ups.</div>";
    return;
  }

  pendingListEl.innerHTML = data
    .map(row => {
      const name = row.users?.name || row.users?.email || "Player";
      return `
        <div class="list-row">
          <span>${escapeHtml(name)}</span>
          <span>
            <button class="btn small" data-approve="${row.id}">Approve</button>
            <button class="btn small" data-remove="${row.id}">Remove</button>
          </span>
        </div>
      `;
    })
    .join("");

  pendingListEl.querySelectorAll("[data-approve]").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.approve;
      const { error: upErr } = await supabase
        .from("league_signups")
        .update({
          approved: true,
          approved_by: currentProfile.id
        })
        .eq("id", id);

      if (upErr) {
        console.error("approve error", upErr);
      }
      await refreshState();
    };
  });

  pendingListEl.querySelectorAll("[data-remove]").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.remove;
      const { error: delErr } = await supabase
        .from("league_signups")
        .delete()
        .eq("id", id);
      if (delErr) {
        console.error("remove error", delErr);
      }
      await refreshState();
    };
  });
}

// Overall refresh
async function refreshState() {
  if (!currentProfile) return;

  const signup = await loadMySignup();

  if (!signup) {
    joinBtn.disabled  = false;
    leaveBtn.disabled = true;
    joinStatusEl.textContent = "You are not signed up for this league.";
  } else {
    joinBtn.disabled  = true;
    leaveBtn.disabled = false;
    joinStatusEl.textContent = signup.approved
      ? "You are enrolled for this league."
      : "Your signup is pending moderator approval.";
  }

  await loadApprovedPlayers();
  await loadPendingSignups();
}

// Init
async function init() {
  await waitForSupabaseAuth();
  currentProfile = await getProfile();

  if (!currentProfile) {
    notLogged.style.display = "block";
    hub.classList.add("hidden");
    return;
  }

  notLogged.style.display = "none";
  hub.classList.remove("hidden");

  userNameEl.textContent = currentProfile.name || "";

  if (currentProfile.is_mod) {
    adminSection.classList.remove("hidden");
  } else {
    adminSection.classList.add("hidden");
  }

  joinBtn.onclick  = joinLeague;
  leaveBtn.onclick = leaveLeague;

  await refreshState();
}

init();