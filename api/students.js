// Returns all students for the teacher dashboard. Protected by the teacher passcode.
module.exports = async (req, res) => {
  const code = (req.headers['x-teacher-code'] || '').toString().replace(/\D/g, '');
  const expect = (process.env.TEACHER_PASSCODE || '').replace(/\D/g, '');
  if (!expect || code !== expect) { res.status(401).json({ error: 'unauthorized' }); return; }
  const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!URL || !KEY) { res.status(500).json({ error: 'db_not_configured' }); return; }
  try {
    const r = await fetch(URL + '/rest/v1/students?select=email,name,level,words,streak,minutes,goals,last_active&order=last_active.desc', {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
    });
    if (!r.ok) { res.status(502).json({ error: 'db_read' }); return; }
    const rows = await r.json();
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ students: rows.map((s) => ({ name: s.name, email: s.email, level: s.level, words: s.words, streak: s.streak, minutes: s.minutes, goals: s.goals, lastActive: s.last_active })) });
  } catch (e) { res.status(500).json({ error: 'server_error' }); }
};
