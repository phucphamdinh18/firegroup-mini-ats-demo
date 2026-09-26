// One Dashboard screen inside the ATS. Real values come only from an authenticated
// server response; there is deliberately no public Sheet URL or invented KPI data.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const $ = id => document.getElementById(id);
const config = window.FIREGROUP_PILOT;
const db = config?.supabaseUrl && config?.publishableKey
  ? createClient(config.supabaseUrl, config.publishableKey) : null;
const sections = [
  ['overview', 'Executive Overview'],
  ['demand', 'Demand & Pipeline'],
  ['offers', 'Offer Analytics'],
  ['sla', 'SLA Analytics'],
  ['sources', 'Source Effectiveness'],
  ['issues', 'Hiring Issues'],
  ['detail', 'Detail Table']
];
const kpis = [
  ['newRequests', 'New Requests', 'Hiring requests opened in the selected period'],
  ['acceptedOffers', 'Accepted Offers', 'Offers accepted in the selected period'],
  ['slaHealth', 'SLA Health', 'Jobs within SLA'],
  ['pausedCancelled', 'Pause / Cancelled', 'Paused or cancelled jobs'],
  ['topSubSource', 'Sourcing Effective', 'Top sub-source by accepted offers'],
  ['hiringIssues', 'Hiring Issues', 'Issues from Hiring Issue Tracking']
];
let activeSection = 'overview';
let currentData = null;

function status(message, kind = 'info') {
  const box = $('dashboardStatus');
  box.textContent = message;
  box.className = `mb-4 rounded-xl border p-3 text-sm ${kind === 'error'
    ? 'border-rose-200 bg-rose-50 text-rose-900'
    : 'border-indigo-200 bg-indigo-50 text-indigo-900'}`;
}

function element(tag, className = '', content = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = content == null ? '—' : String(content);
  return node;
}

function card(title, value, description) {
  const box = element('div', 'card dash-kpi rounded-2xl p-5');
  box.append(element('div', 'text-xs text-slate-500', title));
  box.append(element('div', 'text-2xl font-semibold mt-2', value ?? '—'));
  box.append(element('div', 'text-xs text-slate-500 mt-2', description));
  return box;
}

function panel(title, subtitle) {
  const box = element('section', 'card rounded-2xl p-5 mb-4');
  box.append(element('h3', 'text-lg font-semibold', title));
  if (subtitle) box.append(element('p', 'text-sm text-slate-500 mt-1 mb-4', subtitle));
  return box;
}

function table(parent, columns, rows, valueFor) {
  const wrap = element('div', 'overflow-x-auto');
  const grid = element('table', 'min-w-full text-sm');
  const head = element('thead', 'bg-slate-50 text-slate-500');
  const header = document.createElement('tr');
  columns.forEach(label => header.append(element('th', 'text-left px-3 py-3 font-medium', label)));
  head.append(header); grid.append(head);
  const body = document.createElement('tbody');
  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = element('td', 'px-3 py-6 text-slate-500', 'Chưa có dữ liệu được cấp quyền để hiển thị.');
    cell.colSpan = columns.length; row.append(cell); body.append(row);
  } else rows.forEach(item => {
    const row = element('tr', 'border-t border-slate-100');
    valueFor(item).forEach(value => row.append(element('td', 'px-3 py-3', value ?? '—')));
    body.append(row);
  });
  grid.append(body); wrap.append(grid); parent.append(wrap);
}

function render() {
  const data = currentData || {};
  $('dashboardUpdated').textContent = data.generatedAt || '—';
  $('dashboardPeriod').textContent = $('dashboardYear').value || '—';
  $('dashboardBU').textContent = $('dashboardBusinessUnit').value || 'All BU';
  const menu = $('dashboardSections'); menu.replaceChildren();
  sections.forEach(([id, title], index) => {
    const button = element('button', `rounded-lg px-3 py-2 ${id === activeSection ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-700'}`, `${index + 1} ${title}`);
    button.type = 'button'; button.onclick = () => { activeSection = id; render(); };
    menu.append(button);
  });
  const root = $('dashboardPanels'); root.replaceChildren();
  if (activeSection === 'overview') {
    const intro = panel('Executive Overview', 'Demand, offer output, SLA health, sourcing and hiring risks.');
    const grid = element('div', 'grid sm:grid-cols-2 xl:grid-cols-3 gap-3');
    kpis.forEach(([key, title, description]) => grid.append(card(title, data.kpis?.[key], description)));
    intro.append(grid); root.append(intro);
    const comparison = panel('Executive Comparison Report', 'Selected period compared with the previous period.');
    table(comparison, ['KPI', 'Selected', 'Previous', 'Trend', 'Assessment'], data.comparison || [],
      row => [row.label, row.current, row.previous, row.trend, row.assessment]);
    root.append(comparison);
  }
  if (activeSection === 'demand') {
    const box = panel('Demand & Pipeline', 'New hiring requests by month and by Business Unit.');
    table(box, ['Month', 'New Requests', 'Open Jobs'], data.monthly || [], row => [row.month, row.newRequests, row.openJobs]);
    root.append(box);
  }
  if (activeSection === 'offers') {
    const box = panel('Offer Analytics', 'Accepted offers, actual onboarding and cancelled offers by Business Unit.');
    table(box, ['Business Unit', 'Accepted', 'Onboarded', 'Rejected', 'Cancelled'], data.offersByBu || [],
      row => [row.businessUnit, row.acceptedOffers, row.actualOnboard, row.offerRejected, row.cancelOffer]);
    root.append(box);
  }
  if (activeSection === 'sla') {
    const box = panel('SLA Analytics', 'Within SLA, overdue, on hold, cancelled and records needing data.');
    table(box, ['Business Unit', 'Within SLA', 'Overdue', 'Need Data', 'Open Jobs'], data.slaByBu || [],
      row => [row.businessUnit, row.withinSla, row.overdue, row.needData, row.openJobs]);
    root.append(box);
  }
  if (activeSection === 'sources') {
    const box = panel('Source Effectiveness', 'Which sources and sub-sources resulted in accepted offers.');
    table(box, ['Source', 'Sub Source', 'Accepted Offers', 'Matching'], data.sources || [],
      row => [row.source, row.subSource, row.acceptedOffers, row.matching]);
    root.append(box);
  }
  if (activeSection === 'issues') {
    const box = panel('Hiring Issues', 'Hiring Issue Tracking cases included in the Dashboard.');
    table(box, ['Job ID', 'Business Unit', 'Issue', 'Status'], data.issues || [],
      row => [row.jobId, row.businessUnit, row.issueType, row.status]);
    root.append(box);
  }
  if (activeSection === 'detail') {
    const box = panel('Detail Table', 'Job ID is the link between Hiring Request Master and the ATS pipeline.');
    table(box, ['Job ID', 'Position', 'Business Unit', 'Current Status', 'TA PIC', 'SLA'], data.jobs || [],
      row => [row.jobId, row.position, row.businessUnit, row.currentStatus, row.taPic, row.slaResult]);
    root.append(box);
  }
}

function filters() {
  return {
    year: $('dashboardYear').value,
    quarter: $('dashboardQuarter').value,
    month: $('dashboardMonth').value,
    businessUnit: $('dashboardBusinessUnit').value
  };
}

function populateFilters(data) {
  const year = $('dashboardYear'), bu = $('dashboardBusinessUnit');
  const chosenYear = year.value, chosenBu = bu.value;
  year.replaceChildren(new Option('All years', ''));
  bu.replaceChildren(new Option('All Business Units', ''));
  (data.filters?.years || []).forEach(value => year.add(new Option(String(value), String(value))));
  (data.filters?.businessUnits || []).forEach(value => bu.add(new Option(String(value), String(value))));
  year.value = chosenYear || String(data.filters?.defaultYear || '');
  bu.value = chosenBu;
}

async function loadDashboard() {
  if (!db) return status('Thiếu cấu hình Supabase.', 'error');
  try {
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError || !auth.user) {
      currentData = null; render(); $('dashboardLogin').classList.remove('hidden'); $('dashboardLogout').classList.add('hidden');
      return status('Đăng nhập Google để tải Dashboard. Phần ATS còn lại đang là bản minh họa.');
    }
    $('dashboardLogin').classList.add('hidden'); $('dashboardLogout').classList.remove('hidden');
    const { data: profile, error: profileError } = await db.from('pilot_users')
      .select('active,role').eq('user_id', auth.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.active) {
      currentData = null; render();
      return status('Tài khoản đã đăng nhập nhưng chưa được admin cấp quyền xem Dashboard.');
    }
    status('Đang tải Dashboard theo quyền của tài khoản…');
    const { data, error } = await db.functions.invoke('ats-dashboard', { body: filters() });
    if (error) throw error;
    if (!data || typeof data !== 'object' || !Array.isArray(data.jobs)) throw new Error('Dữ liệu Dashboard chưa đúng định dạng.');
    currentData = data; populateFilters(data); render();
    status(`Đã đồng bộ Dashboard. Tài khoản: ${auth.user.email || 'đã xác thực'}.`);
  } catch (error) {
    currentData = null; render();
    status(`Chưa tải được Dashboard thật: ${error.message || error}. Kết nối máy chủ và phân quyền đang được hoàn thiện.`, 'error');
  }
}

for (let month = 1; month <= 12; month++) $('dashboardMonth').add(new Option(String(month).padStart(2, '0'), String(month).padStart(2, '0')));
['dashboardYear', 'dashboardQuarter', 'dashboardMonth', 'dashboardBusinessUnit'].forEach(id => $(id).addEventListener('change', loadDashboard));
$('dashboardRefresh').addEventListener('click', loadDashboard);
$('dashboardLogin').addEventListener('click', async () => {
  if (!db) return status('Thiếu cấu hình Supabase.', 'error');
  const { error } = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) status(error.message, 'error');
});
$('dashboardLogout').addEventListener('click', async () => { await db?.auth.signOut(); currentData = null; render(); loadDashboard(); });
render(); loadDashboard();
