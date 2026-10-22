const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+91[6-9]\d{9}$/;
const NAME = /^[\p{L}][\p{L}\p{M} .'-]*$/u;
const ENROLLMENT = /^[A-Za-z0-9][A-Za-z0-9/-]{0,31}$/;

function send(res, status, body) {
  return res.status(status).json(body);
}

function settings() {
  return {
    url: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
    secretKey: process.env.SUPABASE_SECRET_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    dbKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    admins: new Set((process.env.ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean))
  };
}

async function requireAdmin(req, cfg) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!match || !cfg.url || !cfg.publishableKey || !cfg.dbKey || cfg.admins.size === 0) return null;
  const response = await fetch(`${cfg.url}/auth/v1/user`, {
    headers: { apikey: cfg.publishableKey, Authorization: `Bearer ${match[1]}` }
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  if (!user || !user.email || !cfg.admins.has(String(user.email).toLowerCase())) return null;
  return String(user.email).toLowerCase();
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return null; }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
}

function validRegistration(body) {
  const fullName = String(body.full_name || '').trim().replace(/\s+/g, ' ');
  const enrollment = String(body.student_id || '').trim();
  const phone = String(body.phone || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const course = String(body.course || '').trim();
  const year = Number(body.academic_year);
  const teamSize = Number(body.team_size);
  const member2Name = String(body.member2_name || '').trim().replace(/\s+/g, ' ');
  const member2Phone = body.member2_phone == null ? null : String(body.member2_phone).trim();
  const member2Email = body.member2_email == null ? null : String(body.member2_email).trim().toLowerCase();

  if (fullName.length < 3 || fullName.length > 100 || !NAME.test(fullName)) return { error: 'Enter a valid full name.' };
  if (!ENROLLMENT.test(enrollment)) return { error: 'Enter a valid enrollment number (up to 32 letters or numbers).' };
  if (!PHONE.test(phone)) return { error: 'Enter a valid 10-digit Indian mobile number.' };
  if (email.length > 120 || !EMAIL.test(email)) return { error: 'Enter a valid email address.' };
  if (course.length < 2 || course.length > 100) return { error: 'Enter a valid course or programme.' };
  if (![1, 2, 3, 4].includes(year)) return { error: 'Choose a valid academic year.' };
  if (![1, 2].includes(teamSize)) return { error: 'Choose a team size of one or two.' };
  if (teamSize === 2) {
    if (member2Name.length < 3 || member2Name.length > 100 || !NAME.test(member2Name)) return { error: 'Enter a valid name for team member 2.' };
    if (!PHONE.test(member2Phone || '')) return { error: 'Enter a valid phone number for team member 2.' };
    if ((member2Email || '').length > 120 || !EMAIL.test(member2Email || '')) return { error: 'Enter a valid email address for team member 2.' };
    if (member2Email === email) return { error: 'Team members must use different email addresses.' };
  }
  return { value: {
    full_name: fullName, student_id: enrollment, phone, email, course, academic_year: year,
    team_size: teamSize,
    member2_name: teamSize === 2 ? member2Name : null,
    member2_phone: teamSize === 2 ? member2Phone : null,
    member2_email: teamSize === 2 ? member2Email : null
  } };
}

module.exports = async function handler(req, res) {
  const cfg = settings();
  if (req.method === 'GET' && new URL(req.url, 'https://admin.invalid').searchParams.get('config') === '1') {
    if (!cfg.url || !cfg.publishableKey) return send(res, 503, { error: 'Admin sign-in is not configured. Set the Supabase URL and publishable key in Vercel.' });
    return send(res, 200, { url: cfg.url, publishableKey: cfg.publishableKey });
  }
  if (!cfg.url || !cfg.publishableKey || !cfg.dbKey) {
    return send(res, 503, { error: 'Admin API is not configured. Set Supabase URL, publishable key, and server-side secret in Vercel.' });
  }
  try {
    const adminEmail = await requireAdmin(req, cfg);
    if (!adminEmail) return send(res, 401, { error: 'Sign in with an authorized admin account to continue.' });
    const url = new URL(req.url, 'https://admin.invalid');
    const id = url.searchParams.get('id');
    const headers = {
      apikey: cfg.dbKey,
      ...(cfg.secretKey ? {} : { Authorization: `Bearer ${cfg.serviceRoleKey}` }),
      'Content-Type': 'application/json'
    };

    if (req.method === 'GET') {
      const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const limit = Math.min(200, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      const select = 'id,full_name,student_id,phone,email,course,academic_year,semester,team_size,member2_name,member2_phone,member2_email,registration_code,created_at';
      const response = await fetch(`${cfg.url}/rest/v1/registrations?select=${select}&order=created_at.desc,id.desc`, {
        headers: { ...headers, Range: `${offset}-${offset + limit - 1}`, 'Range-Unit': 'items', Prefer: 'count=exact' }
      });
      const rows = await response.json().catch(() => []);
      if (!response.ok) {
        console.error('Admin list query failed:', response.status);
        return send(res, 500, { error: 'Could not load registrations. Check that the registration schema migration has been applied.' });
      }
      const range = response.headers.get('content-range') || '';
      const total = Number((range.split('/')[1] || '').replace('*', '')) || 0;
      return send(res, 200, { rows, total, offset, limit });
    }

    if (req.method === 'PATCH') {
      if (!/^\d{1,20}$/.test(id || '')) return send(res, 400, { error: 'Choose a valid registration.' });
      const body = parseBody(req);
      if (!body) return send(res, 400, { error: 'Send valid registration details.' });
      const checked = validRegistration(body);
      if (checked.error) return send(res, 400, { error: checked.error });
      const response = await fetch(`${cfg.url}/rest/v1/registrations?id=eq.${id}`, {
        method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(checked.value)
      });
      const result = await response.json().catch(() => []);
      if (response.status === 409 || (Array.isArray(result) && response.status >= 400)) {
        const detail = Array.isArray(result) ? '' : `${result.message || ''} ${result.details || ''}`;
        return send(res, /23505|unique/i.test(detail) ? 409 : response.status, { error: /member2_email/i.test(detail) ? 'That second-member email is already registered.' : /email/i.test(detail) ? 'That email is already registered.' : 'Could not save the registration.' });
      }
      if (!response.ok) {
        console.error('Admin update failed:', response.status);
        return send(res, 500, { error: 'Could not update this registration.' });
      }
      if (!result.length) return send(res, 404, { error: 'Registration not found.' });
      return send(res, 200, { ok: true, row: result[0] });
    }

    if (req.method === 'DELETE') {
      if (!/^\d{1,20}$/.test(id || '')) return send(res, 400, { error: 'Choose a valid registration.' });
      const response = await fetch(`${cfg.url}/rest/v1/registrations?id=eq.${id}&select=id`, {
        method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' }
      });
      const result = await response.json().catch(() => []);
      if (!response.ok) {
        console.error('Admin delete failed:', response.status);
        return send(res, 500, { error: 'Could not delete this registration.' });
      }
      if (!result.length) return send(res, 404, { error: 'Registration not found.' });
      return send(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return send(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    console.error('Admin API request failed:', error.message);
    return send(res, 503, { error: 'Admin service is temporarily unavailable. Please try again.' });
  }
};
