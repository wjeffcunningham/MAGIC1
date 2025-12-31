import { supabase } from "./config.js";

const root = document.getElementById("players-root");
const searchInput = document.getElementById("search");

let allPlayers = [];

function render(list) {
  if (!list.length) {
    root.innerHTML = `<div class="empty">No players found.</div>`;
    return;
  }

  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Name</th>
        <th class="num">Elo</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");

  list.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <a href="/player.html?id=${p.id}">
          ${p.full_name || p.email}
        </a>
      </td>
      <td class="num">${p.rating ?? "—"}</td>
    `;
    tbody.appendChild(tr);
  });

  root.innerHTML = "";
  root.appendChild(table);
}

async function load() {
  const { data, error } = await supabase
    .from("players")
    .select("id, full_name, email, rating")
    .order("rating", { ascending:false });

  if (error) {
    root.innerHTML = `<div class="empty">Failed to load players.</div>`;
    return;
  }

  allPlayers = data || [];
  render(allPlayers);
}

searchInput?.addEventListener("input", () => {
  const q = searchInput.value.toLowerCase();
  render(
    allPlayers.filter(p =>
      (p.full_name || p.email || "").toLowerCase().includes(q)
    )
  );
});

load();