import crypto from 'crypto';

function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach(part => {
    const [k, v] = part.split('=');
    if (!k || !v) return;
    out[k.trim()] = decodeURIComponent(v.trim());
  });
  return out;
}

export default function session(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    let sid = cookies['nectarv_sid'];
    if (!sid) {
      sid = crypto.randomUUID();
      const isProd = (process.env.NODE_ENV === 'production');
      res.cookie('nectarv_sid', sid, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        maxAge: 365 * 24 * 60 * 60 * 1000
      });
    }
    req.sessionId = sid;
    next();
  } catch (e) {
    next();
  }
}