import { supabase, isAdmin } from "./session.js";

const list = document.getElementById("match-list");

main();
async function main() {
  if (!(await isAdmin())) {
    list.innerHTML = `<p class="text-sm text-red-600">You are not an admin.</p>`;
    return;
  }

  const { data: matches } = await supabase
    .from("league_matches")
    .select("*, A:player_a(full_name), B:player_b(full_name)")
    .eq("approved", false);

  if (!matches?.length) {
    list.innerHTML = `<p class="text-sm text-slate-600">No pending matches.</p>`;
    return;
  }

  list.innerHTML = matches
    .map(m => `
      <div class="border p-4 mb-3 rounded">
        <strong>${m.A.full_name}</strong> vs <strong>${m.B.full_name}</strong>
        <div class="mt-2">
          <button class="approve-btn bg-emerald-600 text-white px-3 py-1 rounded mr-2"
            data-id="${m.id}" data-a="${m.player_a}" data-b="${m.player_b}">
            Approve
          </button>
        </div>
      </div>
    `)
    .join("");

  document.querySelectorAll(".approve-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const A = btn.dataset.a;
      const B = btn.dataset.b;

      await supabase.from("league_matches")
        .update({ approved: true })
        .eq("id", id);

      list.innerHTML = `<p class="text-green-700">Match approved.</p>`;
    });
  });
}