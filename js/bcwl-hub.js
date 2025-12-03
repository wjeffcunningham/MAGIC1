import { supabase } from "./config.js";

// DOM elements
const notLogged = document.getElementById("not-logged");
const hub = document.getElementById("hub");
const userNameEl = document.getElementById("user-name");
const playerCountEl = document.getElementById("player-count");
const playerListEl = document.getElementById("player-list");
const adminSection = document.getElementById("admin-section");
const verifyBtn = document.getElementById("verify-btn");
const verifyListEl = document.getElementById("verify-list");

let currentProfile = null;
let playersCache = [];

async function waitForSupabaseAuth() {
  await supabase.auth.getSession();
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

// ----------------------------------------
// Monthly participation
// ----------------------------------------

async function loadMonthStatus(month) {
  const { data, error } = await supabase
    .from("monthly_participation")
    .select("*")
    .eq("player_id", currentProfile.player_id)
    .eq("month_index", month)
    .maybeSingle();

  const box = document.getElementById("month-status");

  if (error) {
    box.textContent = "Error loading month data.";
    return;
  }

  if (data) {
    box.innerHTML = `
      <p>You are signed up for month ${month}.</p>
      <button id="leave-month">Leave Month</button>
    `;
    document.getElementById("leave-month").onclick = () => leaveMonth(month);
  } else {
    box.innerHTML = `
      <p>You are NOT signed up for month ${month}.</p>
      <button id="join-month">Join Month</button>
    `;
    document.getElementById("join-month").onclick = () => joinMonth(month);
  }
}

async function joinMonth(month) {
  await supabase
    .from("monthly_participation")
    .insert({
      player_id: currentProfile.player_id,
      league_year: 2026,
      month_index: month
    });

  loadMonthStatus(month);
}

async function leaveMonth(month) {
  await supabase
    .from("monthly_participation")
    .delete()
    .eq("player_id", currentProfile.player_id)
    .eq("month_index", month);

  loadMonthStatus(month);
}

// ----------------------------------------
// Player list
// ----------------------------------------

async function loadPlayers(monthIndex = 1) {
  // Load all players signed up for this month with relational join
  const { data, error } = await supabase
    .from("monthly_participation")
    .select(`
      player_id,
      players (
        id,
        full_name,
        email,
        has_paid
      )
    `)
    .eq("league_year", 2026)
    .eq("month_index", monthIndex)
    .order("player_id", { ascending: true });

  if (error) {
    console.error("loadPlayers error", error);
    playerListEl.innerHTML = "<div class='muted'>Error loading players.</div>";
    return;
  }

  const mapped = data
    .map(row => row.players)
    .filter(p => p !== null);

  playerCountEl.textContent = mapped.length;

  if (!mapped.length) {
    playerListEl.innerHTML = "<div class='muted'>No players yet.</div>";
    return;
  }

  playerListEl.innerHTML = mapped
    .map(
      p => `
      <div class="list-row">
        <span>${escapeHtml(p.full_name)}</span>
        <label>
          Paid: <input type="checkbox" data-id="${p.id}" ${p.has_paid ? "checked" : ""}>
        </label>
      </div>`
    )
    .join("");

  // Paid / unpaid toggle
  playerListEl.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.onchange = async () => {
      await supabase
        .from("players")
        .update({ has_paid: cb.checked })
        .eq("id", cb.dataset.id);
    };
  });
}

// ----------------------------------------
// Init
// ----------------------------------------

async function init() {
  await waitForSupabaseAuth();
  currentProfile = await getProfile();

  if (!currentProfile) {
    notLogged.style.display = "block";
    hub.classList.add("hidden");
    return;
  }

  // player_id lookup
  const { data: p } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", currentProfile.id)
    .maybeSingle();

  currentProfile.player_id = p?.id || null;

  notLogged.style.display = "none";
  hub.classList.remove("hidden");

  userNameEl.textContent = currentProfile.name || "";

  if (currentProfile.is_mod) {
    adminSection.classList.remove("hidden");
    verifyBtn.onclick = loadUsersForVerification;
  } else {
    adminSection.classList.add("hidden");
  }

  await loadPlayers();

  document.querySelectorAll(".month-btn").forEach(btn => {
    btn.onclick = () => loadMonthStatus(Number(btn.dataset.month));
  });

  loadMonthStatus(1);
}

init();