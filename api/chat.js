// Go Up — AI backend proxy. Holds the API key server-side; users never see it.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) { res.status(500).json({ error: 'missing_api_key' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const msgs = [];
    for (const m of incoming) {
      if (!m || !m.content) continue;
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const content = String(m.content).slice(0, 8000);
      if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += '\n\n' + content;
      else msgs.push({ role, content });
    }
    if (!msgs.length || msgs[0].role !== 'user') msgs.unshift({ role: 'user', content: 'Hello' });
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.GOUP_MODEL || 'claude-3-5-sonnet-latest', max_tokens: 1200, messages: msgs }),
    });
    if (!upstream.ok) { res.status(upstream.status === 429 ? 429 : 502).json({ error: 'ai_upstream', status: upstream.status }); return; }
    const data = await upstream.json();
    const text = (data && Array.isArray(data.content)) ? data.content.map((c) => c.text || '').join('') : '';
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ text });
  } catch (e) { res.status(500).json({ error: 'server_error' }); }
};
