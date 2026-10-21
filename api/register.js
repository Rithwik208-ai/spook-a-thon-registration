const crypto = require('node:crypto');

const COURSES = new Set([
  'B.Sc IT','B.Sc IT (Hons.)','B.Sc IT (Hons.) with Research','B.Sc','B.Sc (Hons.)','B.Sc Computer Science',
  'B.Sc Computer Science (Hons.)','B.Sc Data Science','B.Sc Mathematics','B.Sc Physics','B.Sc Chemistry',
  'B.Sc Biotechnology','B.Sc Microbiology','B.Sc Forensic Science','B.Sc Statistics','B.Sc Zoology','B.Sc Botany',
  'BCA','BCA (Hons.)','MCA','B.Tech Computer Science','B.Tech Information Technology','B.Tech Artificial Intelligence',
  'B.Tech Data Science','B.Tech Other Branch','M.Sc IT','M.Sc Computer Science','M.Sc Data Science',
  'BBA','BBA (Hons.)','B.Com','B.Com (Hons.)','MBA','M.Com','BA','BA (Hons.)','BA Economics','BA Psychology',
  'B.Des','B.Arch','LLB','Other'
]);

function send(res, status, body) {
  return res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Use POST to submit a registration.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing Supabase environment configuration.');
    return send(res, 503, { error: 'Registration is temporarily unavailable. Please try again soon.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return send(res, 400, { error: 'Invalid registration data.' }); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return send(res, 400, { error: 'Invalid registration data.' });
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 8192) {
    return send(res, 413, { error: 'Registration data is too large.' });
  }

  const fullName = String(body.fullName || '').trim().replace(/\s+/g, ' ');
  const studentId = String(body.studentId || '').trim();
  const phone = String(body.phone || '').replace(/[\s()-]/g, '');
  const email = String(body.email || '').trim().toLowerCase();
  const course = String(body.course || '').trim();
  const academicYear = Number(body.academicYear);
  const semester = Number(body.semester);

  if (fullName.length < 3 || fullName.length > 100 || !/^[\p{L}][\p{L}\p{M} .'-]*$/u.test(fullName)) return send(res, 400, { error: 'Enter a valid full name.' });
  if (!/^\d{11}$/.test(studentId)) return send(res, 400, { error: 'Student ID must be exactly 11 digits.' });
  if (!/^\+91[6-9]\d{9}$/.test(phone)) return send(res, 400, { error: 'Enter a valid 10-digit Indian mobile number.' });
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return send(res, 400, { error: 'Enter a valid email address.' });
  if (!COURSES.has(course)) return send(res, 400, { error: 'Choose a valid course.' });
  if (![1, 2, 3, 4].includes(academicYear)) return send(res, 400, { error: 'Choose a valid academic year.' });
  if (![2 * academicYear - 1, 2 * academicYear].includes(semester)) return send(res, 400, { error: 'Choose a valid semester for your year.' });

  const registrationCode = `SPOOK-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const row = {
    full_name: fullName,
    student_id: studentId,
    phone,
    email,
    course,
    academic_year: academicYear,
    semester,
    registration_code: registrationCode
  };

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/registrations`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(row)
    });

    if (response.status === 201 || response.status === 204) {
      return send(res, 201, { ok: true, code: registrationCode });
    }

    const dbError = await response.json().catch(() => ({}));
    if (response.status === 409 || dbError.code === '23505') {
      const duplicate = `${dbError.message || ''} ${dbError.details || ''}`;
      const field = /email/i.test(duplicate) ? 'email address' : 'student ID';
      return send(res, 409, { error: `This ${field} is already registered.` });
    }

    console.error('Supabase insert failed:', response.status, dbError.code || 'unknown');
    return send(res, 500, { error: 'Something went wrong while saving your registration. Please try again.' });
  } catch (error) {
    console.error('Registration request failed:', error.message);
    return send(res, 503, { error: 'Registration is temporarily unavailable. Please try again soon.' });
  }
};
