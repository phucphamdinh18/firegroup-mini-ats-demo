import http from 'node:http';
import { OAuth2Client } from 'google-auth-library';
import { readAtsSnapshot } from './sheets.js';
import { roleFor, visibleCandidateIds, makeCandidateView, candidatePage } from './access.js';

const { GOOGLE_CLIENT_ID, SPREADSHEET_ID, ATS_ORIGIN, PORT = '8080' } = process.env;
if (!GOOGLE_CLIENT_ID || !SPREADSHEET_ID || !ATS_ORIGIN) {
  throw new Error('Set GOOGLE_CLIENT_ID, SPREADSHEET_ID and ATS_ORIGIN before starting.');
}
const verifier = new OAuth2Client(GOOGLE_CLIENT_ID);

function respond(res, status, payload, origin = '') {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Vary': 'Origin' };
  if (origin === ATS_ORIGIN) headers['Access-Control-Allow-Origin'] = ATS_ORIGIN;
  res.writeHead(status, headers); res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  if (origin && origin !== ATS_ORIGIN) return respond(res, 403, { error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') {
    if (!origin) return respond(res, 403, { error: 'Origin required' });
    res.writeHead(204, { 'Access-Control-Allow-Origin': ATS_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization',
      'Access-Control-Max-Age': '600', 'Vary': 'Origin' });
    return res.end();
  }
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method not allowed' }, origin);
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/health') return respond(res, 200, { ok: true }, origin);
  const match = /^\/api\/candidates\/([^/]+)$/.exec(url.pathname);
  if (url.pathname !== '/api/candidates' && !match) return respond(res, 404, { error: 'Not found' }, origin);
  const authorization = req.headers.authorization || '';
  const token = /^Bearer (\S+)$/.exec(authorization)?.[1];
  if (!token) return respond(res, 401, { error: 'Sign in required' }, origin);
  let claims;
  try {
    const ticket = await verifier.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
    claims = ticket.getPayload();
  } catch {
    return respond(res, 401, { error: 'Invalid or expired sign-in' }, origin);
  }
  if (!claims?.email || claims.email_verified !== true)
    return respond(res, 401, { error: 'Email not verified' }, origin);
  try {
    const snapshot = await readAtsSnapshot(SPREADSHEET_ID);
    const role = roleFor(claims.email, snapshot.users);
    if (!role) return respond(res, 403, { error: 'No ATS access' }, origin);
    const allowedIds = visibleCandidateIds({ email: claims.email, role, teams: snapshot.teams,
      applications: snapshot.applications, interviews: snapshot.interviews });
    if (match) {
      const id = decodeURIComponent(match[1]);
      const row = snapshot.candidates.find(x => String(x['Candidate ID']).trim() === id);
      if (!row || (allowedIds && !allowedIds.has(id))) return respond(res, 404, { error: 'Candidate not found' }, origin);
      return respond(res, 200, { candidate: makeCandidateView(row, role, true) }, origin);
    }
    const page = Number(url.searchParams.get('page') || 1), pageSize = Number(url.searchParams.get('pageSize') || 50);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50)
      return respond(res, 400, { error: 'Invalid page parameters' }, origin);
    const minExperience = url.searchParams.get('minExperience');
    if (minExperience !== null && minExperience !== '' &&
        (!Number.isFinite(Number(minExperience)) || Number(minExperience) < 0 || Number(minExperience) > 80))
      return respond(res, 400, { error: 'Invalid experience filter' }, origin);
    const data = candidatePage(snapshot.candidates, allowedIds, role, {
      page, pageSize, q: url.searchParams.get('q'), location: url.searchParams.get('location'),
      source: url.searchParams.get('source'), seniority: url.searchParams.get('seniority'),
      skill: url.searchParams.get('skill'), domain: url.searchParams.get('domain'), minExperience });
    return respond(res, 200, data, origin);
  } catch (error) {
    if (error.message?.startsWith('Schema mismatch:')) {
      console.error('ATS source schema changed'); return respond(res, 503, { error: 'Data temporarily unavailable' }, origin);
    }
    console.error('Candidate API unavailable:', error.name);
    return respond(res, 503, { error: 'Data temporarily unavailable' }, origin);
  }
});

server.listen(Number(PORT), '0.0.0.0', () => console.log(`ATS read-only API listening on ${PORT}`));
