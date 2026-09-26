// Run: node appscript/ATS_DashboardGateway.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const master = [
  { 'Job ID': 'FG-100', 'Business Unit': 'A', 'Request Month': '2026-01',
    'Offer Accepted Month': '2026-03', 'Offer Accepted Date': '2026-03-10',
    'SLA Result': 'Within SLA', 'Source': 'Referral', 'Sub Source': 'Team' },
  { 'Job ID': 'FG-200', 'Business Unit': 'B', 'Request Month': '2026-03',
    'Offer Accepted Month': '2026-03', 'Offer Accepted Date': '2026-03-08',
    'SLA Result': 'Overdue', 'Source': 'Board', 'Sub Source': 'Site' },
];
const issues = [
  { 'Job ID': 'FG-100', 'Issue Month': '2026-03', 'Issue Type': 'Offer rejected',
    'Included in Hiring Dashboard?': 'Yes' },
  { 'Job ID': 'FG-200', 'Issue Month': '2026-03', 'Issue Type': 'Cancel offer',
    'Included in Hiring Dashboard?': 'Yes' },
];
const sheets = {
  'Hiring Request Master': { getDataRange: () => ({ getValues: () => [Object.keys(master[0]), ...master.map(row => Object.values(row))] }) },
  'Hiring Issue Tracking': { getDataRange: () => ({ getValues: () => [Object.keys(issues[0]), ...issues.map(row => Object.values(row))] }) },
};
const context = {
  SpreadsheetApp: { openById: () => ({ getSheetByName: name => sheets[name] }) },
  Utilities: { formatDate: (date, tz, format) => format === 'yyyy-MM' ? date.toISOString().slice(0, 7) : '2026-03-31 00:00:00' },
  Set, Date, Number, String, Array, Object, RegExp, Math, isFinite, isNaN,
};
vm.runInNewContext(fs.readFileSync(__dirname + '/ATS_DashboardGateway.gs', 'utf8'), context);
const request = { allJobs: false, jobIds: ['FG-100'], filters: { year: '2026', month: '03' } };
const result = context.atsDashboardData_(request);
assert.equal(result.kpis.newRequests, 0, 'Demand follows the January request month');
assert.equal(result.kpis.acceptedOffers, 1, 'Accepted offer follows March acceptance month');
assert.equal(result.kpis.slaHealth, '100%');
assert.equal(result.kpis.hiringIssues, 1, 'Issue follows its own month and Job ID');
assert.equal(result.offersByBu[0].offerRejected, 1);
assert.equal(result.offersByBu[0].cancelOffer, 0);
assert.equal(result.jobs.length, 0, 'The request-period detail has no March request');
assert.equal(result.filters.businessUnits.join(','), 'A', 'Restricted user cannot see other BU choices');
const admin = context.atsDashboardData_({ allJobs: true, jobIds: [], filters: { year: '2026', month: '03' } });
assert.equal(admin.kpis.newRequests, 1);
assert.equal(admin.kpis.acceptedOffers, 2);
assert.equal(admin.kpis.slaHealth, '50%');
assert.equal(admin.kpis.hiringIssues, 2);
console.log('Dashboard period and Job ID isolation checks passed');
