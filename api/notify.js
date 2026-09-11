/* Vercel Serverless Function：微信推送（Server 酱） */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
  const key = process.env.SERVERCHAN_KEY;
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_ANON_KEY;
  if (!key) { res.status(500).json({ error: 'SERVERCHAN_KEY 未配置' }); return; }

  const auth = req.headers.authorization || '';
  if (auth.indexOf('Bearer ') !== 0) { res.status(401).json({ error: '未登录' }); return; }
  if (supaUrl && supaKey) {
    try {
      const r = await fetch(supaUrl.replace(/\/$/, '') + '/auth/v1/user', {
        headers: { apikey: supaKey, Authorization: auth }
      });
      if (!r.ok) { res.status(401).json({ error: '登录校验失败' }); return; }
    } catch (e) { res.status(401).json({ error: '登录校验异常' }); return; }
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
  body = body || {};
  const title = String(body.title || '小小世界').slice(0, 60);
  const desp = String(body.desp || '').slice(0, 800);

  try {
    const r2 = await fetch('https://sctapi.ftqq.com/' + key + '.send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title, desp: desp })
    });
    const j = await r2.json().catch(function () { return {}; });
    res.status(r2.ok ? 200 : 502).json({ ok: r2.ok, result: j });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
