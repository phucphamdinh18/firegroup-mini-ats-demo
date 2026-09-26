// Read-only bridge: GitHub Pages -> authenticated Edge Function -> signed Apps Script.
// Deploy only after pilot_users/pilot_job_access RLS and the Apps Script gateway
// have been verified with two accounts.
import { withSupabase } from 'npm:@supabase/server@^1';

const encoder = new TextEncoder();
const secret = Deno.env.get('ATS_BRIDGE_SECRET');
const gatewayUrl = Deno.env.get('ATS_APPS_SCRIPT_URL');

async function sign(message: string, key: string): Promise<string> {
  const imported = await crypto.subtle.importKey('raw', encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', imported, encoder.encode(message)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function clean(value: unknown, expression: RegExp): string {
  const text = String(value ?? '');
  return expression.test(text) ? text : '';
}

const empty = () => ({ generatedAt: new Date().toISOString(), kpis: {}, comparison: [], monthly: [],
  offersByBu: [], slaByBu: [], sources: [], issues: [], jobs: [], filters: { years: [], businessUnits: [] } });

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, ctx) => {
    if (request.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: 'No authenticated user' }, { status: 401 });

    const { data: profile, error: profileError } = await ctx.supabase.from('pilot_users')
      .select('role,active').eq('user_id', userId).maybeSingle();
    if (profileError || !profile?.active) return Response.json({ error: 'Access not approved' }, { status: 403 });

    const isAdmin = profile.role === 'admin';
    const { data: memberships, error: membershipsError } = await ctx.supabase
      .from('pilot_job_access').select('job_id').eq('user_id', userId).limit(2000);
    if (membershipsError) return Response.json({ error: 'Could not check job access' }, { status: 403 });
    const jobIds = [...new Set((memberships || []).map(row => row.job_id))];
    if (!isAdmin && jobIds.length === 0) return Response.json(empty());

    if (!secret || !gatewayUrl || !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(gatewayUrl)) {
      return Response.json({ error: 'Gateway not configured' }, { status: 503 });
    }
    let requested: Record<string, unknown> = {};
    try { requested = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const filters = {
      year: clean(requested.year, /^(?:|20\d{2})$/),
      quarter: clean(requested.quarter, /^(?:|Q[1-4])$/),
      month: clean(requested.month, /^(?:|0[1-9]|1[0-2])$/),
      businessUnit: clean(requested.businessUnit, /^[\p{L}\p{N} _&/().-]{0,80}$/u)
    };
    // The browser cannot choose its own allowed job IDs. The RLS-scoped query above decides them.
    const payload = JSON.stringify({ issuedAt: Date.now(), nonce: crypto.randomUUID(),
      allJobs: isAdmin, jobIds, filters });
    const signedBody = JSON.stringify({ payload, signature: await sign(payload, secret) });
    try {
      const response = await fetch(gatewayUrl, { method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: signedBody,
        signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error(`Gateway HTTP ${response.status}`);
      const result = await response.json();
      if (result.error) throw new Error('Gateway rejected request');
      if (!Array.isArray(result.jobs)) throw new Error('Invalid gateway response');
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      console.error('ATS gateway unavailable:', error);
      return Response.json({ error: 'Dashboard data temporarily unavailable' }, { status: 502 });
    }
  })
};
