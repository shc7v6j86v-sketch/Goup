// Saves/updates one student's record in the school's database (Supabase).
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!URL || !KEY) { res.status(500).json({ error: 'db_not_configured' }); return; }
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!b.email) { res.status(400).json({ error: 'no_email' }); return; }
    const row = {
      email: String(b.email).toLowerCase().slice(0, 200),
      name: String(b.name || '').slice(0, 120),
      level: String(b.level || 'A1').slice(0, 8),
      words: Number(b.words) || 0,
      streak: Number(b.streak) || 0,
      minutes: Number(b.minutes) || 0,
      goals: Array.isArray(b.goals) ? b.goals : [],
      last_active: b.lastActive || new Date().toISOString(),
    };
    const r = await fetch(URL + '/rest/v1/students?on_conflict=email', {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
    if (!r.ok) { const txt = await r.text(); res.status(502).json({ error: 'db_write', detail: txt.slice(0, 200) }); return; }
    res.status(200).json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'server_error' }); }
};
