(async () => {
  const files = [
    '/leaguetracker/data/raw/events/bcpmm-2026-01.json',
    '/leaguetracker/data/raw/events/connections-2026-01-12.json'
  ];

  for (const path of files) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(res.status);
      const json = await res.json();
      console.log('Loaded:', path, json.event?.id);
    } catch (err) {
      console.error('FAILED:', path, err);
    }
  }
})();