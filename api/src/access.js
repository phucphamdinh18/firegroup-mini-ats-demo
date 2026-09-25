const norm = value => String(value ?? '').trim().toLocaleLowerCase('en-US');
const active = value => ['yes', 'true', 'active', '1'].includes(norm(value));

export function objectsFromValues(values = []) {
  const [headers = [], ...rows] = values;
  return rows.filter(row => row.some(cell => String(cell ?? '').trim())).map(row =>
    Object.fromEntries(headers.map((header, i) => [String(header).trim(), row[i] ?? ''])));
}

export function roleFor(email, users) {
  const matches = users.filter(row => norm(row['User Email']) === norm(email) && active(row['Is Active?']));
  if (matches.length !== 1) return null; // duplicate or missing user grants fail closed
  const roles = String(matches[0]['Role(s)']).split(/[,;|/]/).map(norm);
  for (const role of ['admin', 'recruiter', 'hiring manager', 'interviewer']) {
    if (roles.includes(role)) return role;
  }
  return null;
}

export function visibleCandidateIds({ email, role, teams, applications, interviews }) {
  if (role === 'admin') return null;
  const memberships = teams.filter(row => norm(row['User Email']) === norm(email) && active(row['Is Active?']));
  const assignedJobs = new Set(memberships.filter(row => norm(row['Access Role']) === role && role !== 'interviewer')
    .map(row => String(row['Job ID']).trim()));
  const interviewJobs = new Set(memberships.filter(row => role === 'interviewer' && norm(row['Access Role']) === 'interviewer')
    .map(row => String(row['Job ID']).trim()));
  if (role === 'recruiter' || role === 'hiring manager') return new Set(applications.filter(app => assignedJobs.has(String(app['Job ID']).trim()))
    .map(app => String(app['Candidate ID']).trim()).filter(Boolean));
  if (role !== 'interviewer') return new Set();
  const appsById = new Map(applications.map(app => [String(app['Application ID']).trim(), app]));
  const allowed = new Set();
  for (const iv of interviews) {
    const addresses = String(iv['Interviewer Email(s)']).split(/[,;\n]/).map(norm);
    if (!addresses.includes(norm(email))) continue;
    const app = appsById.get(String(iv['Application ID']).trim());
    if (app && interviewJobs.has(String(app['Job ID']).trim())) allowed.add(String(app['Candidate ID']).trim());
  }
  return allowed;
}

export function makeCandidateView(row, role, detail = false) {
  const view = {
    id: String(row['Candidate ID'] || '').trim(),
    name: row['Full Name'] || '', title: row['Current Title'] || '',
    company: row['Current Company'] || '', experience: row['Total YOE'] || '',
    location: row['Location'] || '', role: row['Primary Role'] || '',
    seniority: row['Seniority'] || '',
    skills: String(row['Skills'] || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean),
    source: row['Primary Source'] || ''
  };
  if (detail) {
    view.domains = String(row['Domains'] || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
    if (role !== 'interviewer') {
      view.email = row['Email'] || '';
      view.phone = row['Phone'] || '';
      view.linkedinUrl = row['LinkedIn URL'] || '';
    }
  }
  // Never expose salaries, Drive file IDs, or CV URLs from this endpoint.
  return view;
}

export function candidatePage(rows, allowedIds, role, options = {}) {
  const page = Number(options.page) || 1;
  const pageSize = Number(options.pageSize) || 50;
  const q = norm(options.q), location = norm(options.location), source = norm(options.source);
  const seniority = norm(options.seniority), skill = norm(options.skill), domain = norm(options.domain);
  const minExperience = options.minExperience === '' || options.minExperience == null
    ? null : Number(options.minExperience);
  const list = rows.filter(row => {
    const id = String(row['Candidate ID'] || '').trim();
    if (!id || (allowedIds && !allowedIds.has(id))) return false;
    if (location && norm(row['Location']) !== location) return false;
    if (source && norm(row['Primary Source']) !== source) return false;
    if (seniority && norm(row['Seniority']) !== seniority) return false;
    if (skill && !norm(row['Skills']).includes(skill)) return false;
    if (domain && !norm(row['Domains']).includes(domain)) return false;
    if (minExperience !== null && !(Number(row['Total YOE']) >= minExperience)) return false;
    return !q || ['Full Name', 'Current Title', 'Current Company', 'Primary Role', 'Skills']
      .some(key => norm(row[key]).includes(q));
  });
  return { page, pageSize, total: list.length,
    items: list.slice((page - 1) * pageSize, page * pageSize).map(row => makeCandidateView(row, role)) };
}
