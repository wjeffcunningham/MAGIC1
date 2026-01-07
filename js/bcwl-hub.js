// /js/bcwl-hub.js
import {
  getAuthUser,
  getProfile,
  ensureProfile,
  getMyLeagueMembership,
  getLeagueRoster,
  joinCurrentLeague
} from "./db.js";

const notLogged   = document.getElementById("not-logged");
const notJoined   = document.getElementById("not-joined");
const hubMain     = document.getElementById("hub-main");

const joinBtn     = document.getElementById("join-btn");
const paymentBox  = document.getElementById("payment-status");
const statusBox   = document.getElementById("confirmation-status");
const rosterList  = document.getElementById("roster-list");

function hideAll() {
  if (notLogged) notLogged.style.display = "none";
  if (notJoined) notJoined.style.display = "none";
  if (hubMain)   hubMain.style.display   = "none";
}

function renderRoster(roster) {
  if (!rosterList) return;
  rosterList.innerHTML = "";

  if (!roster || roster.length === 0) {
    rosterList.textContent = "No players have joined yet.";
    return;
  }

  roster.forEach(player => {
    const row = document.createElement("div");
    row.className = "roster-row";

    const name = player.moderated_handle || player.handle || player.email;

    const statusBits = [];
    statusBits.push(player.payment_status || "unpaid");
    statusBits.push(player.confirmed ? "confirmed" : "unconfirmed");

    row.innerHTML = `
      <div class="roster-name"><strong>${name}</strong></div>
      <div class="roster-meta">${statusBits.join(" • ")}</div>
    `;

    rosterList.appendChild(row);
  });
}

async function init() {
  hideAll();

  // 1) Auth check (session)
  const user = await getAuthUser();
  if (!user) {
    if (notLogged) notLogged.style.display = "block";
    return;
  }

  // 2) Make sure profile exists (auto-create if missing)
  let profile = await getProfile();
  if (!profile) {
    const { error: ensureErr } = await ensureProfile();
    if (ensureErr) {
      console.error("ensureProfile failed:", ensureErr);
      // Still allow them to continue “logged in”, but they may not be able to join.
      // Show "notJoined" with a warning by leaving it visible.
    } else {
      profile = await getProfile();
    }
  }

  // 3) Fetch membership + roster
  const [member, roster] = await Promise.all([
    getMyLeagueMembership(),
    getLeagueRoster()
  ]);

  // Setup Join button behavior
  if (joinBtn) {
    joinBtn.onclick = async () => {
      joinBtn.disabled = true;
      joinBtn.textContent = "Joining…";

      const { error } = await joinCurrentLeague();
      if (error) {
        console.error("joinCurrentLeague error", error);
        joinBtn.disabled = false;
        joinBtn.textContent = "Join the League";
        return;
      }

      await init();
    };
  }

  // 4) Not a member yet
  if (!member) {
    if (notJoined) notJoined.style.display = "block";
    renderRoster(roster);
    return;
  }

  // 5) Member view
  if (hubMain) hubMain.style.display = "block";

  if (paymentBox) {
    paymentBox.textContent = `Payment status: ${member.payment_status || "unpaid"}`;
  }

  if (statusBox) {
    statusBox.textContent = member.confirmed
      ? "Status: confirmed by organizers."
      : "Status: awaiting confirmation.";
  }

  renderRoster(roster);
}

document.addEventListener("DOMContentLoaded", init);