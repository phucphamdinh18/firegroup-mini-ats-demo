import { google } from 'googleapis';
import { objectsFromValues } from './access.js';

const ranges = [
  "'User Access'!A1:G500", "'Job Team Access'!A1:H2000",
  "'Candidates'!A1:AB1000", "'Applications'!A1:U1000", "'Interviews'!A1:AB1000"
];

export async function readAtsSnapshot(spreadsheetId) {
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });
  const tables = Object.fromEntries(['users', 'teams', 'candidates', 'applications', 'interviews']
    .map((name, i) => [name, objectsFromValues(response.data.valueRanges?.[i]?.values)]));
  const required = {
    users: ['User Email', 'Role(s)', 'Is Active?'],
    teams: ['Job ID', 'User Email', 'Access Role', 'Is Active?'],
    candidates: ['Candidate ID', 'Full Name'],
    applications: ['Application ID', 'Candidate ID', 'Job ID'],
    interviews: ['Application ID', 'Interviewer Email(s)']
  };
  for (const [name, columns] of Object.entries(required)) {
    const headers = response.data.valueRanges?.[Object.keys(required).indexOf(name)]?.values?.[0] || [];
    if (columns.some(column => !headers.includes(column))) throw new Error(`Schema mismatch: ${name}`);
  }
  return tables;
}
