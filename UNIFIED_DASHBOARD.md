# Unified ATS Dashboard — work in progress

The new `Dashboard` button in `index.html` shows the seven sections of the existing Apps Script Dashboard inside the ATS navigation. The same GitHub Pages address hosts Dashboard, Jobs, Candidates, Pipeline, and Interviews. The Dashboard screen never embeds the existing Apps Script web app and never puts live Sheet rows or secrets in the public repository.

## Source of truth

- `Hiring Request Master`: Job ID, position, BU, current status, TA PIC, request date, offer accepted date, onboarding date and SLA result.
- `Hiring Issue Tracking`: hiring issues included in the Dashboard.
- `Dashboard_Data_Layer`: the existing production dashboard's aggregate definitions. The draft gateway currently derives a **subset** of metrics from the master tab; it does **not yet** reproduce every existing chart, comparison calculation, snapshot, or SLA rule. Compare those definitions with `Index.html` and `Code.gs` before using the new Dashboard as the production report.
- `Candidates`, `Applications`, `Interviews`: remain the ATS workflow tables. This change does not move or edit them.

## Secure read path

```
ATS index.html -> Supabase Google login -> pilot_users + pilot_job_access RLS
               -> ats-dashboard Edge Function -> HMAC-signed request
               -> separate Apps Script Dashboard gateway -> FireGroup Sheet
```

The Edge Function obtains allowed Job IDs from Supabase RLS. The browser cannot supply its own access list. The Apps Script gateway receives those IDs only in a signed request, filters rows before responding, and returns no candidate names, CV links or salaries. Without an approved account, the UI shows no real metrics.

## Files staged, not deployed

- `dashboard.js`: renders seven Dashboard sections and handles Google login in the same ATS page.
- `supabase/functions/ats-dashboard/index.ts`: verifies a Supabase session and role, reads allowed Job IDs, signs the gateway request.
- `appscript/ATS_DashboardGateway.gs`: a **new standalone** Apps Script web app source for read-only Dashboard data. This does not replace production `Code.gs`, `doGet`, `Index.html`, or triggers. The gateway first restricts `Hiring Request Master` rows to authorized Job IDs, then groups requests by Request Month, accepted offers and SLA by Offer Accepted Month, onboarding by its actual month, pause/cancel by its event date, and issues by Issue Month.

The GitHub PR stays in draft. The public Pages site does not yet have this UI. A signed-in Supabase account, active pilot tables, a deployed Edge Function and Apps Script gateway are all required before live Sheet data can appear. Until then, all Dashboard KPIs show `—`; other ATS demo sections still use fictional records.

## Before connecting real data

1. Configure Supabase Google Auth and `pilot-schema.sql` from `supabase/PILOT.md`. Admin must approve accounts and their Job IDs.
2. Review the existing Dashboard calculations and reconcile the remaining metrics, especially historical comparison, snapshots, source matching, pipeline status mapping, and issue matching. The date basis for core counts has been aligned with production `Code.gs`, with a focused offline fixture (`node appscript/ATS_DashboardGateway.test.cjs`). The draft still does **not** reproduce the entire Dashboard, and the production hybrid Dashboard sometimes uses global `Dashboard_Data_Layer` aggregates. Those global aggregates cannot be served to a user restricted to Job IDs. Compare results on a representative, nonproduction dataset before calling the views equivalent.
3. Create a **separate** Apps Script project with `appscript/ATS_DashboardGateway.gs`, bind its read access to the existing FireGroup Sheet, and deploy as a web app executing as its owner. Only the HMAC-verified handler reads data; use a long random `ATS_BRIDGE_SECRET` Script Property. A public URL without this check would expose HR data.
4. Set the same secret in Supabase Edge Function secrets as `ATS_BRIDGE_SECRET`, plus the new web app URL as `ATS_APPS_SCRIPT_URL`. Deploy `ats-dashboard` with user JWT verification enabled. Never place either secret in GitHub Pages or a GitHub commit.
5. Set Supabase Auth's Site URL and redirect allow list to the GitHub Pages `index.html` page. Test two Google accounts: admin and a single-job interviewer. Check that unassigned jobs and their aggregates never appear. Then test revoke/lock, errors, and refresh.
6. Only after the UI, security checks, metrics, and nonproduction tests pass, merge the PR and switch users from the existing Dashboard URL. Keep the original dashboard available while comparing results.

No production Sheet, Apps Script files, triggers or Supabase settings have been changed by this PR.
