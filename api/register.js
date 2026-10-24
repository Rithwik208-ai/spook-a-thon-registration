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
  // Supabase's newer sb_secret_ keys are valid for server-side REST calls,
  // but unlike legacy service_role JWTs they must not be sent as Bearer tokens.
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = secretKey || serviceKey;
  if (!supabaseUrl || !apiKey) {
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

  const teamName = String(body.teamName || body.fullName || '').trim().replace(/\s+/g, ' ');
  const fullName = String(body.fullName || '').trim().replace(/\s+/g, ' ');
  const enrollmentNumber = String(body.enrollmentNumber ?? body.studentId ?? '').trim();
  const phone = String(body.phone || '').replace(/[\s()-]/g, '');
  const email = String(body.email || '').trim().toLowerCase();
  const course = String(body.course || '').trim();
  const academicYear = Number(body.academicYear);
  const teamSize = Number(body.teamSize || 1);
  const otherCourse = String(body.otherCourse || '').trim();
  const member2 = body.member2 && typeof body.member2 === 'object' && !Array.isArray(body.member2) ? body.member2 : {};
  const member2Name = String(member2.fullName || '').trim().replace(/\s+/g, ' ');
  const member2Phone = String(member2.phone || '').replace(/[\s()-]/g, '');
  const member2Email = String(member2.email || '').trim().toLowerCase();
  const storedCourse = course === 'Other' ? otherCourse : course;

  if (teamName.length < 2 || teamName.length > 60) return send(res, 400, { error: 'Enter a team name between 2 and 60 characters.' });
  if (fullName.length < 3 || fullName.length > 100 || !/^[\p{L}][\p{L}\p{M} .'-]*$/u.test(fullName)) return send(res, 400, { error: 'Enter a valid full name.' });
  if (!/^[A-Za-z0-9][A-Za-z0-9/-]{0,31}$/.test(enrollmentNumber)) return send(res, 400, { error: 'Enter a valid enrollment number (up to 32 letters or numbers).' });
  if (!/^\+91[6-9]\d{9}$/.test(phone)) return send(res, 400, { error: 'Enter a valid 10-digit Indian mobile number.' });
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return send(res, 400, { error: 'Enter a valid email address.' });
  if (!COURSES.has(course) || (course === 'Other' ? otherCourse.length < 2 || otherCourse.length > 100 : false)) return send(res, 400, { error: 'Choose a course or enter your course under Other.' });
  if (![1, 2, 3, 4].includes(academicYear)) return send(res, 400, { error: 'Choose a valid academic year.' });
  if (![1, 2].includes(teamSize)) return send(res, 400, { error: 'Choose a team size of one or two members.' });
  if (teamSize === 2) {
    if (member2Name.length < 3 || member2Name.length > 100 || !/^[\p{L}][\p{L}\p{M} .'-]*$/u.test(member2Name)) return send(res, 400, { error: 'Enter a valid full name for team member 2.' });
    if (!/^\+91[6-9]\d{9}$/.test(member2Phone)) return send(res, 400, { error: 'Enter a valid 10-digit Indian mobile number for team member 2.' });
    if (member2Email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(member2Email)) return send(res, 400, { error: 'Enter a valid email address for team member 2.' });
    if (member2Email === email) return send(res, 400, { error: 'Each team member must use a different email address.' });
  }

  const registrationCode = `SPOOK-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const row = {
    team_name: teamName,
    full_name: fullName,
    student_id: enrollmentNumber,
    phone,
    email,
    course: storedCourse,
    academic_year: academicYear,
    team_size: teamSize,
    member2_name: teamSize === 2 ? member2Name : null,
    member2_phone: teamSize === 2 ? member2Phone : null,
    member2_email: teamSize === 2 ? member2Email : null,
    registration_code: registrationCode
  };

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/registrations`, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        ...(secretKey ? {} : { Authorization: `Bearer ${serviceKey}` }),
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
      const field = /member2_email/i.test(duplicate) ? 'team member 2 email address' : /email/i.test(duplicate) ? 'email address' : 'enrollment number';
      return send(res, 409, { error: `This ${field} is already registered.` });
    }

    console.error('Supabase insert failed:', response.status, dbError.code || 'unknown');
    return send(res, 500, { error: 'Something went wrong while saving your registration. Please try again.' });
  } catch (error) {
    console.error('Registration request failed:', error.message);
    return send(res, 503, { error: 'Registration is temporarily unavailable. Please try again soon.' });
  }
};
