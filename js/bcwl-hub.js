// /js/bcwl-hub.js
import { supabase } from "./config.js";

// DOM elements
const notLogged = document.getElementById("not-logged");
const hub = document.getElementById("hub");
const userNameEl = document.getElementById("user-name");
const joinBtn = document.getElementById("join-btn");
const leaveBtn = document.getElementById("leave-btn");
const joinStatus = document.getElementById("join-status");
const playerCountEl = document.getElementById("player-count");
const playerListEl = document.getElementById("player-list");
const adminSection = document.getElementById("admin-section");
const verifyBtn = document.getElementById("verify-btn");
const verifyListEl = document.getElementById("verify-list");

// League identifier
const LEAGUE = "BCWL2026JAN";
let currentProfile = null;
let playersCache = [];

// Wait for Supabase session
async function waitForSupabaseAuth() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) return;
  return new Promise((resolve) => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        subscription.unsubscribe();
        resolve();
      }
    });
  });
}

async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  try {
    const { data } = await supabase
      .from("users")
      .select("id, name, is_mod, verified")
      .eq("id", user.id)
      .maybeSingle();
    return data ?? null;
  } catch (err) {
    console.error("getProfile error", err);
    return { id: user.id, name: user.email, is_mod: false, verified: false };
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function loadSignups() {
  const { count } = await supabase
    .from("league_signups")
    .select("*", { count: "exact", head: true })
    .eq("league", LEAGUE);
  playerCountEl.textContent = count ?? 0;

  const { data, error } = await supabase
    .from("league_signups")
    .select("user_id, users(name)")
    .eq("league", LEAGUE)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("signup list error", error);
    playerListEl.innerHTML = "<div class='muted'>Error loading players.</div>";
    return;
  }

  playersCache = data.map((row) => ({
    id: row.user_id,
    name: row.users?.name || "Player",
  }));

  if (playersCache.length === 0) {
    playerListEl.innerHTML = "<div class='muted'>No players yet.</div>";
  } else {
    playerListEl.innerHTML = playersCache
      .map((p) => `<div class="list-row"><span>${escapeHtml(p.name)}</span></div>`)
      .join("");
  }

  if (!currentProfile) {
    joinBtn.disabled = true;
    leaveBtn.disabled = true;
  } else {
    const isInLeague = playersCache.some((p) => p.id === currentProfile.id);
    joinBtn.disabled = isInLeague;
    leaveBtn.disabled = !isInLeague;
  }
}

async function joinLeague() {
  if (!currentProfile) {
    joinStatus.textContent = "Log in first.";
    return;
  }
  joinStatus.textContent = "Joining…";
  const { error } = await supabase
    .from("league_signups")
    .insert({ user_id: currentProfile.id, league: LEAGUE });
  joinStatus.textContent = error ? error.message : "Joined!";
  await loadSignups();
}

async function leaveLeague() {
  if (!currentProfile) return;
  joinStatus.textContent = "Leaving…";
  const { error } = await supabase
    .from("league_signups")
    .delete()
    .eq("user_id", currentProfile.id)
    .eq("league", LEAGUE);
  joinStatus.textContent = error ? error.message : "Removed.";
  await loadSignups();
}

async function loadUsersForVerification() {
  verifyListEl.innerHTML = "Loading…";
  const { data, error } = await supabase
    .from("users")
    .select("id, name, verified")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("admin load users error", error);
    verifyListEl.innerHTML = "<div class='muted'>Error loading users.</div>";
    return;
  }
  verifyListEl.innerHTML = data
    .map(
      (u) => `
      <div class="list-row">
        <span>${escapeHtml(u.name)}</span>
        <span>
          <input type="checkbox" data-id="${u.id}" ${u.verified ? "checked" : ""}/>
        </span>
      </div>
    `
    )
    .join("");
  verifyListEl.querySelectorAll("input").forEach((box) => {
    box.onchange = async () => {
      const id = box.dataset.id;
      const verified = box.checked;
      const { error: upErr } = await supabase
        .from("users")
        .update({ verified })
        .eq("id", id);
      if (upErr) {
        console.error("verify error", upErr);
        box.checked = !verified;
      }
    };
  });
}

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
    verifyBtn.onclick = loadUsersForVerification;
  } else {
    adminSection.classList.add("hidden");
  }
  await loadSignups();
}

joinBtn.onclick = joinLeague;
leaveBtn.onclick = leaveLeague;

init();