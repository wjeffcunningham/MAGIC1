// /js/bcwl-hub.js
import { supabase } from "./config.js";

const LEAGUE_CODE = "BCWL2026";
const MAX_PLAYERS = 32; // soft cap used for display only for now

// DOM
const notLogged     = document.getElementById("not-logged");
const hub           = document.getElementById("hub");
const userNameEl    = document.getElementById("user-name");
const joinBtn       = document.getElementById("join-btn");
const leaveBtn      = document.getElementById("leave-btn");
const joinStatus    = document.getElementById("join-status");
const adminSection  = document.getElementById("admin-section");
const pendingListEl = document.getElementById("pending-list");
const playerCountEl = document.getElementById("player-count");
const playerListEl  = document.getElementById("player-list");

let currentProfile = null;

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
    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, session) => {
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

  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, is_mod")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("bcwl getProfile error", error);
    return null;
  }

  return {
    id: data.id,
    name: data.name || data.email || user.email,
    email: data.email || user.email,
    is_mod: !!data.is_mod,
  };
}

async function loadSignupStatus() {
  const { data, error } = await supabase
    .from("league_signups")
    .select("id, status")
    .eq("league", LEAGUE_CODE)
    .eq("user_id", currentProfile.id)
    .maybeSingle();

  if (error) {
    console.error("loadSignupStatus error", error);
    joinStatus.textContent = "Error loading your league status.";
    joinBtn.disabled = true;
    leaveBtn.disabled = true;
    return null;
  }

  joinBtn.disabled  = false;
  leaveBtn.disabled = false;

  if (!data) {
    joinStatus.textContent = "You are not currently signed up.";
    leaveBtn.disabled      = true;
    joinBtn.textContent    = "Join the League ($20/month)";
    return null;
  }

  if (data.status === "approved") {
    joinStatus.textContent = "You are approved for the league.";
    joinBtn.disabled       = true;
    leaveBtn.disabled      = false;
  } else if (data.status === "pending") {
    joinStatus.textContent = "Your signup is pending moderator approval.";
    leaveBtn.disabled      = false;
  } else if (data.status === "rejected") {
    joinStatus.textContent = "Your signup has been declined.";
    joinBtn.disabled       = true;
    leaveBtn.disabled      = false;
  }

  return data;
}

async function joinLeague() {
  if (!currentProfile) {
    joinStatus.textContent = "Please log in first.";
    return;
  }

  joinStatus.textContent = "Sending signup…";

  // Prevent duplicates
  const existing = await loadSignupStatus();
  if (existing) {
    joinStatus.textContent = "You already have a signup record.";
    return;
  }

  const { error } = await supabase
    .from("league_signups")
    .insert({
      user_id: currentProfile.id,
      league: LEAGUE_CODE,
      // status stays 'pending' until a mod approves
    });

  if (error) {
    console.error("joinLeague error", error);
    joinStatus.textContent = error.message || "Could not join league.";
    return;
  }

  joinStatus.textContent = "Signup submitted for approval.";
  await refreshAdminView();
  await loadSignupStatus();
}

async function leaveLeague() {
  if (!currentProfile) return;

  joinStatus.textContent = "Removing signup…";

  const { error } = await supabase
    .from("league_signups")
    .delete()
    .eq("league", LEAGUE_CODE)
    .eq("user_id", currentProfile.id);

  if (error) {
    console.error("leaveLeague error", error);
    joinStatus.textContent = error.message || "Error leaving league.";
    return;
  }

  joinStatus.textContent = "You have left the league.";
  await refreshAdminView();
  await loadSignupStatus();
}

// ---------- admin-only views ----------

async function loadPendingSignups() {
  const { data, error } = await supabase
    .from("league_signups")
    .select("id, created_at, users(name, email)")
    .eq("league", LEAGUE_CODE)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("loadPendingSignups error", error);
    pendingListEl.innerHTML = "<div class='muted'>Error loading pending sign-ups.</div>";
    return;
  }

  if (!data || !data.length) {
    pendingListEl.innerHTML = "<div class='muted'>No pending sign-ups.</div>";
    return;
  }

  pendingListEl.innerHTML = data.map(row => {
    const u = row.users || {};
    return `
      <div class="list-row">
        <span>
          <strong>${escapeHtml(u.name || u.email || "Unnamed Player")}</strong><br>
          <span class="muted">${escapeHtml(u.email || "")}</span>
        </span>
        <span>
          <button class="btn" data-approve="${row.id}">Approve</button>
          <button class="btn" data-reject="${row.id}">Reject</button>
        </span>
      </div>
    `;
  }).join("");

  pendingListEl.querySelectorAll("[data-approve]").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.approve;
      const { error: upErr } = await supabase
        .from("league_signups")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: currentProfile.id,
        })
        .eq("id", id);

      if (upErr) {
        console.error("approve error", upErr);
        return;
      }

      // TODO: trigger welcome email via Edge Function / external service here.
      await refreshAdminView();
    };
  });

  pendingListEl.querySelectorAll("[data-reject]").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.reject;
      const { error: upErr } = await supabase
        .from("league_signups")
        .update({ status: "rejected" })
        .eq("id", id);

      if (upErr) {
        console.error("reject error", upErr);
        return;
      }
      await refreshAdminView();
    };
  });
}

async function loadApprovedPlayers() {
  const { data, error } = await supabase
    .from("league_signups")
    .select("id, has_paid, users(name, email)")
    .eq("league", LEAGUE_CODE)
    .eq("status", "approved")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("loadApprovedPlayers error", error);
    playerListEl.innerHTML = "<div class='muted'>Error loading players.</div>";
    playerCountEl.textContent = "0";
    return;
  }

  const list = data || [];
  playerCountEl.textContent = String(list.length);

  if (!list.length) {
    playerListEl.innerHTML = "<div class='muted'>No approved players yet.</div>";
    return;
  }

  playerListEl.innerHTML = list.map(row => {
    const u = row.users || {};
    return `
      <div class="list-row">
        <span>
          <strong>${escapeHtml(u.name || u.email || "Unnamed Player")}</strong><br>
          <span class="muted">${escapeHtml(u.email || "")}</span>
        </span>
        <label>
          <input type="checkbox" data-paid="${row.id}" ${row.has_paid ? "checked" : ""} />
          Paid
        </label>
      </div>
    `;
  }).join("");

  playerListEl.querySelectorAll("input[data-paid]").forEach(box => {
    box.onchange = async () => {
      const { error: upErr } = await supabase
        .from("league_signups")
        .update({ has_paid: box.checked })
        .eq("id", box.dataset.paid);

      if (upErr) {
        console.error("has_paid update error", upErr);
        box.checked = !box.checked;
      }
    };
  });
}

async function refreshAdminView() {
  if (!currentProfile?.is_mod) return;
  await Promise.all([loadPendingSignups(), loadApprovedPlayers()]);
}

// ---------- init ----------

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

  userNameEl.textContent = currentProfile.name || currentProfile.email;

  await loadSignupStatus();

  if (currentProfile.is_mod) {
    adminSection.classList.remove("hidden");
    await refreshAdminView();
  } else {
    adminSection.classList.add("hidden");
    // players list is effectively hidden for non-mods
  }
}

joinBtn.onclick  = joinLeague;
leaveBtn.onclick = leaveLeague;

init();