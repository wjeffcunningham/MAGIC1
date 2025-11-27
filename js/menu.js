// menu.js
//
// Builds the dynamic menu inside #menu-panel.
// Requires:
//   - session.js
//   - db.js
//   - supabase.js
//

import { getLocalSession, clearLocalSession } from "/js/session.js";
import {
  getCurrentPlayer,
  getActiveSeasonForToday,
  listActiveSignupsForSeason,
} from "/js/db.js";

const panel = document.getElementById("menu-panel");
const icon  = document.getElementById("menu-icon");

// Toggle panel open/closed
icon.addEventListener("click", () => {
  panel.classList.toggle("open");
});

// Close panel if clicking outside
document.addEventListener("click", (e) => {
  if (!panel.contains(e.target) && e.target !== icon) {
    panel.classList.remove("open");
  }
});

// Utility: Create a menu link
function makeLink(label, href, extra = "") {
  return `<a class="menu-link" href="${href}">${label}${extra}</a>`;
}

// Utility: Group titles
function makeGroup(title) {
  return `<div class="menu-group-title">${title}</div>`;
}

// Render menu
async function renderMenu() {
  let html = "";
  const sess = getLocalSession();
  const loggedIn = sess && sess.playerId;

  let player = null;
  let isAdmin = false;
  let season = null;
  let alreadySignedUp = false;

  if (loggedIn) {
    player = await getCurrentPlayer();
    isAdmin = player?.is_admin === true;

    season = await getActiveSeasonForToday();
    if (season) {
      const signups = await listActiveSignupsForSeason(season.id);
      alreadySignedUp = signups.some((s) => s.player_id === player.id);
    }
  }

  // -------------------------------
  // LOGGED OUT MENU
  // -------------------------------
  if (!loggedIn) {
    html += makeGroup("Account");
    html += makeLink("Log In", "/login.html");
    html += makeLink("Create Account", "/login.html#signup");
    panel.innerHTML = html;
    return;
  }

  // -------------------------------
  // LOGGED IN MENU
  // -------------------------------
  html += makeGroup("Account");

  html += `
    <div class="menu-link" style="cursor:default;">
      <span style="font-weight:600;">${player.full_name}</span>
    </div>
  `;

  html += makeLink("Profile", "/profile.html");
  html += makeLink("My Matches", "/my-matches.html");

  html += `<a class="menu-link" href="#" id="logout-link">Log Out</a>`;

  // -------------------------------
  // LEAGUE SECTION
  // -------------------------------
  html += makeGroup("League");

  if (season) {
    html += `
      <div class="menu-link" style="cursor:default;">
        ${season.name}
      </div>
    `;

    if (!alreadySignedUp) {
      html += makeLink("Join the League", "/league/signup.html");
    } else {
      html += `
        <div class="menu-link" style="cursor:default;">
          <span style="color:#0a0;font-weight:600;">Joined ✔</span>
        </div>
      `;
      html += makeLink("League Standings", "/league/standings.html");
      html += makeLink("Report Match", "/report-match.html");
    }

  } else {
    html += `
      <div class="menu-link" style="cursor:default;">
        No active league season
      </div>
    `;
  }

  // -------------------------------
  // ADMIN SECTION
  // -------------------------------
  if (isAdmin) {
    html += makeGroup("Admin");
    html += makeLink("Admin Workspace", "/admin/index.html");
    html += makeLink("Approve Players", "/admin/pending-players.html");
    html += makeLink("Approve Matches", "/admin/approve-matches.html");
    html += makeLink("Pods & Pairings", "/admin/pods.html");
    html += makeLink("League Data", "/admin/players.html");
  }

  // Insert into panel
  panel.innerHTML = html;

  // Logout handler
  const logoutLink = document.getElementById("logout-link");
  if (logoutLink) {
    logoutLink.addEventListener("click", (e) => {
      e.preventDefault();
      clearLocalSession();
      window.location.href = "/";
    });
  }
}

renderMenu();