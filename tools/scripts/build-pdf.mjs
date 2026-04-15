import { chromium } from 'playwright';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);

const OUT_DIR = '/tmp/screenshots';

const VIEWS = [
  { label: 'Login Page',          file: 'Login_Page.png',          section: 'Authentication',    badge: 'PUBLIC', color: '#64748B' },
  { label: 'Master Catalogue',    file: 'Master_Catalogue.png',    section: 'Core Views',        badge: 'ADMIN', color: '#2563EB' },
  { label: 'Master Map',          file: 'Master_Map.png',          section: 'Core Views',        badge: 'ADMIN', color: '#2563EB' },
  { label: 'Process Catalogue',   file: 'Process_Catalogue.png',   section: 'Core Views',        badge: 'ADMIN', color: '#2563EB' },
  { label: 'Process Map',         file: 'Process_Map.png',         section: 'Core Views',        badge: 'ADMIN', color: '#2563EB' },
  { label: 'Mission & Vision',    file: 'Mission___Vision.png',    section: 'Strategy',          badge: 'ADMIN', color: '#2563EB' },
  { label: 'Strategic Planning',  file: 'Strategic_Planning.png',  section: 'Strategy',          badge: 'ADMIN', color: '#2563EB' },
  { label: 'Initiatives',         file: 'Initiatives.png',         section: 'Strategy',          badge: 'ADMIN', color: '#2563EB' },
  { label: 'Governance',          file: 'Governance.png',          section: 'Governance',        badge: 'ADMIN', color: '#2563EB' },
  { label: 'Workflows',           file: 'Workflows.png',           section: 'Productivity',      badge: 'ADMIN', color: '#2563EB' },
  { label: 'Documents',           file: 'Documents.png',           section: 'Productivity',      badge: 'ADMIN', color: '#2563EB' },
  { label: 'Meetings',            file: 'Meetings.png',            section: 'Productivity',      badge: 'ADMIN', color: '#2563EB' },
  { label: 'Calendar',            file: 'Calendar.png',            section: 'Productivity',      badge: 'ADMIN', color: '#2563EB' },
  { label: 'Activities',          file: 'Activities.png',          section: 'Productivity',      badge: 'ADMIN', color: '#2563EB' },
  { label: 'Tasks',               file: 'Tasks.png',               section: 'Productivity',      badge: 'ADMIN', color: '#2563EB' },
  { label: 'Queues',              file: 'Queues.png',              section: 'Productivity',      badge: 'ADMIN', color: '#2563EB' },
  { label: 'AI Agents',           file: 'AI_Agents.png',           section: 'AI',                badge: 'ADMIN', color: '#2563EB' },
  { label: 'Connectors',          file: 'Connectors.png',          section: 'Integrations',      badge: 'ADMIN', color: '#2563EB' },
  { label: 'Dashboards',          file: 'Dashboards.png',          section: 'System',            badge: 'ADMIN', color: '#2563EB' },
  { label: 'Reports',             file: 'Reports.png',             section: 'System',            badge: 'ADMIN', color: '#2563EB' },
  { label: 'Audit & Logs',        file: 'Audit___Logs.png',        section: 'System',            badge: 'ADMIN', color: '#2563EB' },
  { label: 'Settings',            file: 'Settings.png',            section: 'System',            badge: 'ADMIN', color: '#2563EB' },
  { label: 'Users',               file: 'Users.png',               section: 'Admin',             badge: 'ADMIN', color: '#2563EB' },
  { label: 'Configuration',       file: 'Configuration.png',       section: 'Admin',             badge: 'ADMIN', color: '#2563EB' },
  { label: 'Tenant Management',   file: 'Tenant_Management.png',   section: 'Tenant Management', badge: 'SUPERUSER', color: '#D97706' },
];

// Build base64 image map
const images = {};
for (const v of VIEWS) {
  const fpath = path.join(OUT_DIR, v.file);
  if (fs.existsSync(fpath)) {
    images[v.file] = 'data:image/png;base64,' + fs.readFileSync(fpath).toString('base64');
  }
}

// Build HTML
let screensHtml = '';
let currentSection = '';

for (const v of VIEWS) {
  if (v.section !== currentSection) {
    currentSection = v.section;
    screensHtml += `<div class="section-header">${v.section}</div>`;
  }
  const src = images[v.file] || '';
  screensHtml += `
  <div class="screen-page">
    <div class="screen-meta">
      <span class="badge" style="background:${v.color}20;color:${v.color};border:1.5px solid ${v.color}">${v.badge}</span>
      <span class="section-tag">${v.section}</span>
    </div>
    <div class="screen-title">${v.label}</div>
    ${src ? `<img class="screenshot" src="${src}" alt="${v.label}" />` : '<div class="no-img">Screenshot not available</div>'}
  </div>`;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#fff; color:#1e293b; }

  .cover {
    width:100%; height:100vh; display:flex; flex-direction:column;
    align-items:center; justify-content:center; background:#1E3A5F;
    page-break-after: always;
  }
  .cover h1 { font-size:64px; font-weight:800; color:#fff; letter-spacing:-1px; }
  .cover h2 { font-size:28px; font-weight:400; color:#93c5fd; margin-top:12px; }
  .cover .date { font-size:16px; color:#64748b; margin-top:20px; }
  .cover .legend { display:flex; gap:24px; margin-top:40px; }
  .cover .leg-item { display:flex; align-items:center; gap:8px; font-size:14px; }
  .cover .leg-dot { width:12px; height:12px; border-radius:50%; }

  .section-header {
    page-break-before: always;
    padding: 60px 60px 20px;
    font-size: 13px; font-weight:700; text-transform:uppercase; letter-spacing:2px; color:#94a3b8;
    border-bottom: 1px solid #e2e8f0;
  }

  .screen-page {
    padding: 32px 60px 40px;
    page-break-inside: avoid;
    border-bottom: 1px solid #f1f5f9;
  }

  .screen-meta { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
  .badge {
    display:inline-block; padding:2px 10px; border-radius:20px;
    font-size:11px; font-weight:700; letter-spacing:0.5px;
  }
  .section-tag { font-size:12px; color:#94a3b8; }

  .screen-title {
    font-size:22px; font-weight:700; color:#1e3a5f; margin-bottom:16px;
  }

  .screenshot {
    width:100%; max-width:100%; border-radius:6px;
    border:1px solid #e2e8f0; box-shadow:0 2px 8px rgba(0,0,0,0.08);
    display:block;
  }

  .no-img { padding:40px; text-align:center; color:#ef4444; font-style:italic; background:#fef2f2; border-radius:6px; }

  @media print {
    .screen-page { page-break-after: always; }
    .section-header { page-break-after: avoid; }
  }
</style>
</head>
<body>
  <div class="cover">
    <h1>BusinessOS</h1>
    <h2>Complete Screen Reference</h2>
    <div class="date">${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}</div>
    <div class="legend">
      <div class="leg-item"><div class="leg-dot" style="background:#2563EB"></div><span style="color:#93c5fd">Tenant Admin screens</span></div>
      <div class="leg-item"><div class="leg-dot" style="background:#D97706"></div><span style="color:#fbbf24">Superuser (Tenant Management) screens</span></div>
    </div>
  </div>
  ${screensHtml}
</body>
</html>`;

fs.writeFileSync('/tmp/screenshots/BusinessOS-Screens.html', html);
console.log('HTML written');

// Print to PDF via Playwright
const browser = await chromium.launch({
  executablePath: '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.goto('file:///tmp/screenshots/BusinessOS-Screens.html', { waitUntil: 'load' });
await page.pdf({
  path: '/tmp/screenshots/BusinessOS-Screens.pdf',
  format: 'A4',
  printBackground: true,
  margin: { top: '0', bottom: '0', left: '0', right: '0' },
});
await browser.close();
console.log('PDF written:', '/tmp/screenshots/BusinessOS-Screens.pdf');
const stat = fs.statSync('/tmp/screenshots/BusinessOS-Screens.pdf');
console.log('PDF size:', (stat.size/1024/1024).toFixed(1), 'MB');
