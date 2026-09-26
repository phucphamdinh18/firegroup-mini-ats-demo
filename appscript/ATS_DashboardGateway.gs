/**
 * Dedicated read-only Apps Script gateway for the unified ATS Dashboard.
 * This file is staged in GitHub. Deploy as a SEPARATE Apps Script web app after
 * reviewing its permissions; do not paste it over the production Code.gs/doGet.
 * Set Script Property ATS_BRIDGE_SECRET to the same long random value stored in
 * Supabase Edge Function secrets. Never put that value in GitHub Pages.
 */
var ATS_DASHBOARD_SHEET_ID = '1CzOVMubyEzgQnnvg4YAtrdWTbb2GOo6oc_1Og8hPwjA';

function doPost(e) {
  try {
    var envelope = JSON.parse(e && e.postData && e.postData.contents || '{}');
    var secret = PropertiesService.getScriptProperties().getProperty('ATS_BRIDGE_SECRET');
    if (!secret || typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') {
      throw new Error('Request rejected');
    }
    var expected = Utilities.computeHmacSha256Signature(envelope.payload, secret)
      .map(function(byte) { return ('0' + (byte & 255).toString(16)).slice(-2); }).join('');
    if (!atsSameString_(expected, envelope.signature)) throw new Error('Request rejected');
    var payload = JSON.parse(envelope.payload);
    if (!Number.isFinite(payload.issuedAt) || Math.abs(Date.now() - payload.issuedAt) > 60000 ||
        !/^[0-9a-f-]{36}$/i.test(payload.nonce || '')) throw new Error('Request expired');
    var cache = CacheService.getScriptCache();
    if (cache.get('ats-' + payload.nonce)) throw new Error('Duplicate request');
    cache.put('ats-' + payload.nonce, '1', 120);
    if (typeof payload.allJobs !== 'boolean' || !Array.isArray(payload.jobIds) || payload.jobIds.length > 2000 ||
        payload.jobIds.some(function(id) { return typeof id !== 'string' || !/^[A-Z0-9-]{2,32}$/.test(id); })) {
      throw new Error('Request rejected');
    }
    return atsJson_(atsDashboardData_(payload));
  } catch (error) {
    // Apps Script ContentService does not support changing the HTTP status here.
    return atsJson_({ error: 'Dashboard request rejected' });
  }
}

function atsSameString_(a, b) {
  if (a.length !== b.length) return false;
  var difference = 0;
  for (var i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function atsJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function atsRead_(sheet) {
  if (!sheet) throw new Error('Missing source tab');
  var rows = sheet.getDataRange().getValues();
  var headers = rows.shift().map(String);
  return rows.map(function(row) {
    var record = {};
    headers.forEach(function(header, column) { record[header] = row[column]; });
    return record;
  });
}

function atsText_(value) { return value == null ? '' : String(value).trim(); }
function atsDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  var parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}
function atsMonth_(date) { return String(date.getMonth() + 1).padStart(2, '0'); }
function atsQuarter_(date) { return 'Q' + (Math.floor(date.getMonth() / 3) + 1); }
function atsNumber_(value) { var number = Number(value); return isFinite(number) ? number : 0; }
function atsYes_(value) { return /^(yes|true|1|y)$/i.test(atsText_(value)); }

function atsDashboardData_(request) {
  var f = request.filters || {};
  var allowed = new Set(request.jobIds);
  var workbook = SpreadsheetApp.openById(ATS_DASHBOARD_SHEET_ID);
  var master = atsRead_(workbook.getSheetByName('Hiring Request Master'));
  var visible = master.filter(function(row) {
    var id = atsText_(row['Job ID']);
    return id && (request.allJobs || allowed.has(id));
  });
  var allYears = Array.from(new Set(visible.map(function(row) {
    var date = atsDate_(row['Requesting Date']); return date ? String(date.getFullYear()) : '';
  }).filter(Boolean))).sort().reverse();
  var allUnits = Array.from(new Set(visible.map(function(row) { return atsText_(row['Business Unit']); }).filter(Boolean))).sort();
  var selected = visible.filter(function(row) {
    var date = atsDate_(row['Requesting Date']);
    if (f.businessUnit && atsText_(row['Business Unit']) !== f.businessUnit) return false;
    if ((f.year || f.quarter || f.month) && !date) return false;
    return (!f.year || String(date.getFullYear()) === f.year) &&
      (!f.quarter || atsQuarter_(date) === f.quarter) &&
      (!f.month || atsMonth_(date) === f.month);
  });
  var selectedIds = new Set(selected.map(function(row) { return atsText_(row['Job ID']); }));
  var issues = atsRead_(workbook.getSheetByName('Hiring Issue Tracking'))
    .filter(function(row) { return selectedIds.has(atsText_(row['Job ID'])) && atsYes_(row['Included in Hiring Dashboard?']); });
  var within = 0, overdue = 0, needData = 0, paused = 0, accepted = 0, onboarded = 0;
  var months = {}, offersByBu = {}, slaByBu = {}, sourceCounts = {};
  selected.forEach(function(row) {
    var unit = atsText_(row['Business Unit']) || 'Unassigned';
    var status = atsText_(row['Current Status']);
    var sla = atsText_(row['SLA Result']);
    var date = atsDate_(row['Requesting Date']);
    var month = date ? String(date.getFullYear()) + '-' + atsMonth_(date) : '';
    var isPaused = /on.?hold|pause|cancel/i.test(status);
    if (isPaused) paused++;
    if (/within|on.?time|met/i.test(sla)) within++;
    else if (/overdue|delay|late/i.test(sla)) overdue++;
    else if (!isPaused) needData++;
    if (row['Offer Accepted Date']) accepted++;
    if (row['Actual Onboarding Date']) onboarded++;
    if (month) {
      months[month] = months[month] || { month: month, newRequests: 0, openJobs: 0 };
      months[month].newRequests++;
      if (/open/i.test(status)) months[month].openJobs++;
    }
    offersByBu[unit] = offersByBu[unit] || { businessUnit: unit, acceptedOffers: 0, actualOnboard: 0, offerRejected: 0, cancelOffer: 0 };
    offersByBu[unit].acceptedOffers += row['Offer Accepted Date'] ? 1 : 0;
    offersByBu[unit].actualOnboard += row['Actual Onboarding Date'] ? 1 : 0;
    slaByBu[unit] = slaByBu[unit] || { businessUnit: unit, withinSla: 0, overdue: 0, needData: 0, openJobs: 0 };
    slaByBu[unit].withinSla += /within|on.?time|met/i.test(sla) ? 1 : 0;
    slaByBu[unit].overdue += /overdue|delay|late/i.test(sla) ? 1 : 0;
    slaByBu[unit].needData += !sla && !isPaused ? 1 : 0;
    slaByBu[unit].openJobs += /open/i.test(status) ? 1 : 0;
    if (row['Offer Accepted Date']) {
      var sourceKey = atsText_(row['Source']) + '|' + atsText_(row['Sub Source']);
      sourceCounts[sourceKey] = (sourceCounts[sourceKey] || 0) + 1;
    }
  });
  var sources = Object.keys(sourceCounts).map(function(key) {
    var parts = key.split('|'); return { source: parts[0], subSource: parts[1], acceptedOffers: sourceCounts[key], matching: '—' };
  }).sort(function(a, b) { return b.acceptedOffers - a.acceptedOffers; });
  return {
    generatedAt: Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss'),
    filters: { years: allYears, businessUnits: allUnits },
    kpis: { newRequests: selected.length, acceptedOffers: accepted,
      slaHealth: within + overdue ? Math.round(within * 100 / (within + overdue)) + '%' : '—',
      pausedCancelled: paused, topSubSource: sources.length ? sources[0].subSource : '—', hiringIssues: issues.length },
    comparison: [], monthly: Object.keys(months).sort().map(function(key) { return months[key]; }),
    offersByBu: Object.keys(offersByBu).sort().map(function(key) { return offersByBu[key]; }),
    slaByBu: Object.keys(slaByBu).sort().map(function(key) { return slaByBu[key]; }),
    sources: sources,
    issues: issues.map(function(row) { return { jobId: atsText_(row['Job ID']),
      businessUnit: atsText_(row['Business Unit']), issueType: atsText_(row['Issue Type']),
      status: atsText_(row['Issue Stage']) }; }),
    jobs: selected.map(function(row) { return { jobId: atsText_(row['Job ID']),
      position: atsText_(row['Position']), businessUnit: atsText_(row['Business Unit']),
      currentStatus: atsText_(row['Current Status']), taPic: atsText_(row['TA PIC']),
      slaResult: atsText_(row['SLA Result']) }; })
  };
}
