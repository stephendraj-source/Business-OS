import { chromium } from 'playwright';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);

const OUT = '/tmp/screenshots';

// All screens in order — label, filename, badge, section, note
const SCREENS = [
  // Authentication
  { label:'Login Page',                          file:'Login_Page.png',                      section:'Authentication',    badge:'PUBLIC',     note:'Sign-in screen. All users start here.' },

  // Core Views
  { label:'Master Catalogue',                    file:'Master_Catalogue.png',                section:'Core Views',        badge:'ADMIN',      note:'Full process catalogue with inline editing, 104 processes across all categories.' },
  { label:'Master Map — Overview',               file:'Master_Map.png',                      section:'Core Views',        badge:'ADMIN',      note:'Category-level mind map. Select a category to drill in.' },
  { label:'Master Map — Finance & Compliance',   file:'Master_Map_Finance_Category_Open.png',section:'Core Views',        badge:'ADMIN',      note:'After clicking Finance & Compliance — processes appear in the right panel.' },
  { label:'Master Map — Process Selected',       file:'Master_Map_Process_In_Panel.png',     section:'Core Views',        badge:'ADMIN',      note:'A process is selected; detail panel expands on the right.' },
  { label:'Process Catalogue',                   file:'Process_Catalogue.png',               section:'Core Views',        badge:'ADMIN',      note:'Filtered view showing only processes marked as included in the portfolio (31 processes).' },
  { label:'Process Map — Overview',              file:'Process_Map.png',                     section:'Core Views',        badge:'ADMIN',      note:'Process map by category. Select a category to see its processes.' },
  { label:'Process Map — Technology & Data',     file:'Process_Map_Category_Technology.png', section:'Core Views',        badge:'ADMIN',      note:'After clicking Technology & Data — 31 processes listed on the right.' },
  { label:'Process Map — Process Detail',        file:'Process_Map_Process_Detail.png',      section:'Core Views',        badge:'ADMIN',      note:'A process is selected, showing its full detail including KPIs, AI agent, and workflow.' },

  // Strategy
  { label:'Mission & Vision',                    file:'Mission___Vision.png',                section:'Strategy',          badge:'ADMIN',      note:'Define the organisation\'s Mission, Vision, Purpose, and Values.' },
  { label:'Strategic Planning — Goals',          file:'Strategic_Planning.png',              section:'Strategy',          badge:'ADMIN',      note:'Strategic goals list with status badges and linked initiatives.' },
  { label:'Strategic Planning — Add Goal',       file:'Strategic_Planning_Add_Goal.png',     section:'Strategy',          badge:'ADMIN',      note:'Add Goal form — set goal title, description, owner, timeline, and KPIs.' },
  { label:'Strategic Planning — Goal Detail',    file:'Strategic_Planning_Goal_Detail.png',  section:'Strategy',          badge:'ADMIN',      note:'Expanded goal showing linked processes, KPIs, and progress tracking.' },
  { label:'Initiatives — Overview',              file:'Initiatives.png',                     section:'Strategy',          badge:'ADMIN',      note:'Strategic initiatives linked to goals. Empty state — no initiatives yet.' },
  { label:'Initiatives — Add Initiative',        file:'Initiatives_Add_Initiative.png',      section:'Strategy',          badge:'ADMIN',      note:'Add Initiative form — title, description, owner, linked goal, and dates.' },

  // Governance
  { label:'Governance — Overview',               file:'Governance.png',                      section:'Governance',        badge:'ADMIN',      note:'Compliance standards register. Empty state — no standards added yet.' },
  { label:'Governance — Add Standard',           file:'Governance_Add_Standard.png',         section:'Governance',        badge:'ADMIN',      note:'Add Compliance Standard form — title, category, status, and evidence links.' },

  // Productivity — Workflows
  { label:'Workflows — Overview',                file:'Workflows.png',                       section:'Productivity',      badge:'ADMIN',      note:'Workflow list with 5 saved workflows.' },
  { label:'Workflows — Designer',                file:'Workflows_Designer_Open.png',         section:'Productivity',      badge:'ADMIN',      note:'Visual workflow designer — if/then/else logic builder with step editor.' },

  // Productivity — Documents
  { label:'Documents — Library',                 file:'Documents.png',                       section:'Productivity',      badge:'ADMIN',      note:'Documents & knowledge library — forms, wiki pages, URL bookmarks, organised by folder.' },
  { label:'Documents — New Document Menu',       file:'Documents_New_Type_Menu.png',         section:'Productivity',      badge:'ADMIN',      note:'Clicking + New opens a type selector — Form, Wiki Page, URL, or upload.' },
  { label:'Documents — Employee Handbook',       file:'Documents_View_Employee_Handbook.png',section:'Productivity',      badge:'ADMIN',      note:'Rich text document editor — Employee Handbook open in the right panel.' },
  { label:'Documents — Nonprofit Toolkit',       file:'Documents_View_Nonprofit_Toolkit.png',section:'Productivity',      badge:'ADMIN',      note:'URL bookmark view — Nonprofit Toolkit link document open.' },

  // Productivity — Meetings
  { label:'Meetings — Overview',                 file:'Meetings.png',                        section:'Productivity',      badge:'ADMIN',      note:'Meetings list grouped by date. 4 meetings including Board Review, Sprint Planning, Stakeholder Update.' },
  { label:'Meetings — Q1 Board Review Detail',   file:'Meetings_Q1_Board_Review_Detail.png', section:'Productivity',      badge:'ADMIN',      note:'Meeting detail panel — agenda, attendees, location, and action items.' },
  { label:'Meetings — New Meeting',              file:'Meetings_New_Meeting_Detail.png',     section:'Productivity',      badge:'ADMIN',      note:'New meeting detail — blank meeting ready for agenda and attendees.' },

  // Productivity — Calendar / Activities / Tasks / Queues
  { label:'Calendar',                            file:'Calendar.png',                        section:'Productivity',      badge:'ADMIN',      note:'Monthly calendar view — March 2026 with 3 upcoming meetings visible.' },
  { label:'Activities',                          file:'Activities.png',                      section:'Productivity',      badge:'ADMIN',      note:'Activity log — 3 activities across Email, Phone, and Other modes.' },
  { label:'Tasks — Overview',                    file:'Tasks.png',                           section:'Productivity',      badge:'ADMIN',      note:'Task board — 6 tasks with priority, status, approval workflow, and queue assignment.' },
  { label:'Tasks — Task Detail',                 file:'Tasks_Detail_Panel.png',              section:'Productivity',      badge:'ADMIN',      note:'Task detail side panel — title, source, assignee, approvals, linked processes.' },
  { label:'Tasks — New Task',                    file:'Tasks_New_Task_Modal.png',            section:'Productivity',      badge:'ADMIN',      note:'New task creation form — title, description, priority, queue, and assignee.' },
  { label:'Queues',                              file:'Queues.png',                          section:'Productivity',      badge:'ADMIN',      note:'Task queues — Board Meetings, General, and Unqueued groups with task counts.' },

  // AI
  { label:'AI Agents — Overview',               file:'AI_Agents.png',                       section:'AI',                badge:'ADMIN',      note:'AI agent list — 4 agents configured including Onboarding Agent.' },
  { label:'AI Agents — Onboarding Agent',       file:'AI_Agents_Onboarding_Detail.png',     section:'AI',                badge:'ADMIN',      note:'Agent detail — instructions, knowledge base, schedule, and activity log.' },

  // Integrations
  { label:'Connectors',                          file:'Connectors.png',                      section:'Integrations',      badge:'ADMIN',      note:'Connector library — Zapier, Custom API, MCP Server, Salesforce and more.' },

  // System
  { label:'Dashboards',                          file:'Dashboards.png',                      section:'System',            badge:'ADMIN',      note:'Customisable dashboard — Process Summary, Category Breakdown, Portfolio Status, Performance Overview.' },
  { label:'Reports',                             file:'Reports.png',                         section:'System',            badge:'ADMIN',      note:'Process Coverage report — 84% avg completeness across 104 processes.' },
  { label:'Audit & Logs',                        file:'Audit___Logs.png',                    section:'System',            badge:'ADMIN',      note:'Audit trail — all changes to processes and settings recorded with timestamp and actor.' },
  { label:'Settings',                            file:'Settings.png',                        section:'System',            badge:'ADMIN',      note:'Workspace settings — colour theme, organisation display name, and preferences.' },

  // Admin
  { label:'Users',                               file:'Users.png',                           section:'Admin',             badge:'ADMIN',      note:'User management — roles, categories, active status, and process scope.' },
  { label:'Configuration',                       file:'Configuration.png',                   section:'Admin',             badge:'ADMIN',      note:'Organisation profile, contacts, colour scheme, and system lookup values.' },

  // Superuser
  { label:'Tenant Management',                   file:'Tenant_Management.png',               section:'Tenant Management', badge:'SUPERUSER',  note:'Platform-level view — create and manage tenant organisations, credits, and blueprints.' },
];

// Encode images as base64
const b64 = {};
for (const s of SCREENS) {
  const fp = path.join(OUT, s.file);
  if (fs.existsSync(fp)) b64[s.file] = 'data:image/png;base64,' + fs.readFileSync(fp).toString('base64');
  else console.warn('MISSING:', s.file);
}

const BLUE = '#2563EB'; const AMBER = '#D97706'; const GREY = '#64748B';
const badgeColor = b => b === 'SUPERUSER' ? AMBER : b === 'PUBLIC' ? GREY : BLUE;

let idx = 1;
let currentSection = '';
let screensHtml = '';

// Table of contents
let tocHtml = '';
let tocSection = '';
for (const s of SCREENS) {
  if (s.section !== tocSection) {
    tocSection = s.section;
    tocHtml += `<div class="toc-section">${s.section}</div>`;
  }
  tocHtml += `<div class="toc-item"><span class="toc-num">${idx++}</span><span class="toc-label">${s.label}</span></div>`;
}

idx = 1;
for (const s of SCREENS) {
  const bc = badgeColor(s.badge);
  if (s.section !== currentSection) {
    currentSection = s.section;
    screensHtml += `<div class="section-divider"><span>${s.section}</span></div>`;
  }
  const src = b64[s.file] || '';
  screensHtml += `
  <div class="screen-page">
    <div class="screen-header">
      <span class="screen-num">${idx++}</span>
      <div>
        <div class="screen-title">${s.label}</div>
        <div class="screen-meta">
          <span class="badge" style="background:${bc}18;color:${bc};border:1.5px solid ${bc}">${s.badge}</span>
          <span class="section-tag">${s.section}</span>
        </div>
      </div>
    </div>
    <p class="screen-note">${s.note}</p>
    ${src
      ? `<img class="screenshot" src="${src}" alt="${s.label}" />`
      : `<div class="no-img">Screenshot not captured</div>`}
  </div>`;
}

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif; background:#fff; color:#1e293b; }

/* Cover */
.cover { width:100%; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:linear-gradient(135deg,#1E3A5F 0%,#1e40af 100%); page-break-after:always; padding:60px 0; }
.cover-logo { width:80px; height:80px; background:rgba(255,255,255,0.15); border-radius:20px; display:flex; align-items:center; justify-content:center; margin-bottom:32px; font-size:40px; }
.cover h1 { font-size:60px; font-weight:800; color:#fff; letter-spacing:-1.5px; }
.cover h2 { font-size:24px; font-weight:400; color:#93c5fd; margin-top:12px; }
.cover .date { font-size:14px; color:#64748b; margin-top:16px; letter-spacing:0.5px; }
.cover .legend { display:flex; gap:32px; margin-top:48px; padding:20px 36px; background:rgba(255,255,255,0.1); border-radius:12px; }
.cover .leg { display:flex; align-items:center; gap:8px; font-size:13px; }
.cover .leg-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
.cover .leg-text { color:#cbd5e1; }
.cover .count { margin-top:24px; font-size:13px; color:#64748b; }

/* TOC */
.toc-page { padding:56px 72px; page-break-after:always; }
.toc-page h2 { font-size:28px; font-weight:700; color:#1E3A5F; margin-bottom:32px; padding-bottom:12px; border-bottom:2px solid #e2e8f0; }
.toc-section { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:#94a3b8; margin:20px 0 6px; }
.toc-item { display:flex; align-items:baseline; gap:8px; padding:4px 0; border-bottom:1px dotted #e2e8f0; }
.toc-num { font-size:12px; color:#94a3b8; width:24px; flex-shrink:0; text-align:right; }
.toc-label { font-size:13px; color:#374151; }

/* Section dividers */
.section-divider { display:flex; align-items:center; gap:16px; padding:40px 72px 0; page-break-before:always; }
.section-divider span { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:2px; color:#94a3b8; white-space:nowrap; }
.section-divider::after { content:''; flex:1; height:1px; background:#e2e8f0; }

/* Screen pages */
.screen-page { padding:28px 72px 36px; page-break-inside:avoid; border-bottom:1px solid #f1f5f9; }
.screen-header { display:flex; align-items:flex-start; gap:16px; margin-bottom:8px; }
.screen-num { font-size:28px; font-weight:800; color:#e2e8f0; flex-shrink:0; line-height:1; margin-top:2px; }
.screen-title { font-size:20px; font-weight:700; color:#1e3a5f; margin-bottom:6px; }
.screen-meta { display:flex; align-items:center; gap:8px; }
.badge { display:inline-block; padding:2px 9px; border-radius:20px; font-size:10px; font-weight:700; letter-spacing:0.5px; }
.section-tag { font-size:11px; color:#94a3b8; }
.screen-note { font-size:12px; color:#64748b; margin:8px 0 14px; line-height:1.5; }
.screenshot { width:100%; border-radius:6px; border:1px solid #e2e8f0; box-shadow:0 1px 6px rgba(0,0,0,0.07); display:block; }
.no-img { padding:32px; text-align:center; color:#ef4444; font-style:italic; background:#fef2f2; border-radius:6px; font-size:13px; }

@media print {
  .screen-page { page-break-after:always; }
  .section-divider { page-break-after:avoid; }
}
</style></head><body>

<div class="cover">
  <div class="cover-logo">⬡</div>
  <h1>BusinessOS</h1>
  <h2>Complete Screen Reference</h2>
  <div class="date">${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>
  <div class="legend">
    <div class="leg"><div class="leg-dot" style="background:#2563EB"></div><span class="leg-text">Tenant Admin screens</span></div>
    <div class="leg"><div class="leg-dot" style="background:#D97706"></div><span class="leg-text">Superuser — Tenant Management</span></div>
    <div class="leg"><div class="leg-dot" style="background:#64748B"></div><span class="leg-text">Public (no login required)</span></div>
  </div>
  <div class="count">${SCREENS.length} screens total</div>
</div>

<div class="toc-page">
  <h2>Screen Index</h2>
  ${tocHtml}
</div>

${screensHtml}

</body></html>`;

fs.writeFileSync('/tmp/screenshots/BusinessOS-Full.html', html);
console.log('HTML written');

// Print to PDF
const browser = await chromium.launch({
  executablePath: '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome',
  headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu'],
});
const pg = await browser.newPage();
await pg.goto('file:///tmp/screenshots/BusinessOS-Full.html', { waitUntil:'load' });
await pg.pdf({
  path: '/tmp/screenshots/BusinessOS-Full.pdf',
  format: 'A4',
  printBackground: true,
  margin: { top:'0', bottom:'0', left:'0', right:'0' },
});
await browser.close();

const stat = fs.statSync('/tmp/screenshots/BusinessOS-Full.pdf');
console.log(`PDF: /tmp/screenshots/BusinessOS-Full.pdf  (${(stat.size/1024/1024).toFixed(1)} MB)`);
