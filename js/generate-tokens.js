import { supabase } from "./supabase.js";

const container = document.getElementById("players-container");
const ORIGIN = window.location.origin;

// Random token generator
function generateRandomToken(len = 32) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function hashToken(rawToken) {
  const enc = new TextEncoder();
  const data = enc.encode(rawToken);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function loadPlayers() {
  // players
  const { data: players, error: playersErr } = await supabase
    .from("players")
    .select("id, full_name, username, email")
    .order("full_name");

  if (playersErr) {
    container.innerHTML = `<p class="text-red-600">Error loading players.</p>`;
    return;
  }

  // existing tokens
  const { data: tokens, error: tokensErr } = await supabase
    .from("player_tokens")
    .select("player_id");

  const tokenMap = new Set((tokens || []).map((t) => t.player_id));

  container.innerHTML = "";
  for (const p of players) {
    const row = document.createElement("div");
    row.className =
      "bg-white p-4 rounded-lg shadow flex flex-col gap-2 md:flex-row md:items-center md:justify-between";

    const left = document.createElement("div");
    left.innerHTML = `
      <div class="font-semibold">${p.full_name}</div>
      <div class="text-sm text-slate-600">
        Username: ${p.username || "<em>none</em>"}<br/>
        Email: ${p.email || "<em>none</em>"}
      </div>
    `;

    const right = document.createElement("div");
    right.className = "flex flex-col items-end gap-2";

    const btn = document.createElement("button");
    btn.className =
      "bg-sky-600 text-white text-xs px-3 py-1 rounded hover:bg-sky-700";
    btn.textContent = tokenMap.has(p.id)
      ? "Regenerate Link"
      : "Generate Link";

    const linkEl = document.createElement("input");
    linkEl.type = "text";
    linkEl.readOnly = true;
    linkEl.className =
      "w-64 border px-2 py-1 rounded text-xs text-slate-700 bg-slate-50";
    linkEl.placeholder = "Link will appear here";

    const copyBtn = document.createElement("button");
    copyBtn.className =
      "bg-slate-200 text-slate-800 text-xs px-3 py-1 rounded hover:bg-slate-300";
    copyBtn.textContent = "Copy Link";

    copyBtn.addEventListener("click", () => {
      if (!linkEl.value) return;
      navigator.clipboard.writeText(linkEl.value);
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy Link"), 1500);
    });

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Generating…";

      const rawToken = generateRandomToken(40);
      const tokenHash = await hashToken(rawToken);

      const { error: upsertErr } = await supabase.from("player_tokens").upsert(
        {
          player_id: p.id,
          token_hash: tokenHash,
        },
        { onConflict: "player_id" }
      );

      if (upsertErr) {
        btn.textContent = "Error";
        btn.disabled = false;
        console.error(upsertErr);
        return;
      }

      const loginUrl = `${ORIGIN}/login.html?token=${encodeURIComponent(
        rawToken
      )}`;

      linkEl.value = loginUrl;
      btn.textContent = "Regenerate Link";
      btn.disabled = false;
    });

    right.appendChild(btn);
    right.appendChild(linkEl);
    right.appendChild(copyBtn);

    row.appendChild(left);
    row.appendChild(right);

    container.appendChild(row);
  }
}

loadPlayers();