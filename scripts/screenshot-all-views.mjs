/**
 * BusinessOS — Full-screen walkthrough screenshot script
 * Uses token-in-URL for instant authentication (no login flow needed).
 * Outputs: /tmp/screenshots/*.png + /tmp/screenshots/BusinessOS-Screens.docx
 */

import { chromium } from 'playwright';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const {
  Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel,
  AlignmentType, PageBreak, BorderStyle, ShadingType, convertInchesToTwip
} = require('docx');

// ── Config ────────────────────────────────────────────────────────────────────
const APP_URL = 'http://localhost:80';
const OUT_DIR  = '/tmp/screenshots';
fs.mkdirSync(OUT_DIR, { recursive: true });

// Pre-signed JWTs (valid 30 days from 2026-03-23)
const ADMIN_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEzLCJ0ZW5hbnRJZCI6Miwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzc0MjY2NTc1LCJleHAiOjE3NzY4NTg1NzV9.nJ1_xCd4UCuF5hbCP0qoJ3hVKP6iFHOnBUpuwUoy0K8';
const SUPER_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjIsInRlbmFudElkIjpudWxsLCJyb2xlIjoic3VwZXJ1c2VyIiwiaWF0IjoxNzc0MjY2NTc1LCJleHAiOjE3NzY4NTg1NzV9.rQy6gKUZk7kHeGs04YuINqSAczixGp_OQxDsN1ZvL7c';

// ── Views ─────────────────────────────────────────────────────────────────────
const VIEWS = [
  // Authentication (no token)
  { label: 'Login Page',           url: `${APP_URL}/`,                                               section: 'Authentication',   isTenantMgmt: false },

  // Core Views
  { label: 'Master Catalogue',     url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=table`,               section: 'Core Views',       isTenantMgmt: false },
  { label: 'Master Map',           url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=tree`,                section: 'Core Views',       isTenantMgmt: false },
  { label: 'Process Catalogue',    url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=portfolio`,           section: 'Core Views',       isTenantMgmt: false },
  { label: 'Process Map',          url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=process-map`,         section: 'Core Views',       isTenantMgmt: false },

  // Strategy
  { label: 'Mission & Vision',     url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=strategy`,            section: 'Strategy',         isTenantMgmt: false },
  { label: 'Strategic Planning',   url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=strategic-planning`,  section: 'Strategy',         isTenantMgmt: false },
  { label: 'Initiatives',          url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=initiatives`,         section: 'Strategy',         isTenantMgmt: false },

  // Governance
  { label: 'Governance',           url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=governance`,          section: 'Governance',       isTenantMgmt: false },

  // Productivity
  { label: 'Workflows',            url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=workflows`,           section: 'Productivity',     isTenantMgmt: false },
  { label: 'Documents',            url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=forms`,               section: 'Productivity',     isTenantMgmt: false },
  { label: 'Meetings',             url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=meetings`,            section: 'Productivity',     isTenantMgmt: false },
  { label: 'Calendar',             url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=calendar`,            section: 'Productivity',     isTenantMgmt: false },
  { label: 'Activities',           url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=activities`,          section: 'Productivity',     isTenantMgmt: false },
  { label: 'Tasks',                url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=tasks`,               section: 'Productivity',     isTenantMgmt: false },
  { label: 'Queues',               url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=queues`,              section: 'Productivity',     isTenantMgmt: false },

  // AI
  { label: 'AI Agents',            url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=ai-agents`,           section: 'AI',               isTenantMgmt: false },

  // Integrations
  { label: 'Connectors',           url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=connectors`,          section: 'Integrations',     isTenantMgmt: false },

  // System
  { label: 'Dashboards',           url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=dashboards`,          section: 'System',           isTenantMgmt: false },
  { label: 'Reports',              url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=reports`,             section: 'System',           isTenantMgmt: false },
  { label: 'Audit & Logs',         url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=audit-logs`,          section: 'System',           isTenantMgmt: false },
  { label: 'Settings',             url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=settings`,            section: 'System',           isTenantMgmt: false },

  // Admin
  { label: 'Users',                url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=users`,               section: 'Admin',            isTenantMgmt: false },
  { label: 'Configuration',        url: `${APP_URL}/?token=${ADMIN_TOKEN}&view=configuration`,       section: 'Admin',            isTenantMgmt: false },

  // Superuser
  { label: 'Tenant Management',    url: `${APP_URL}/?token=${SUPER_TOKEN}`,                          section: 'Tenant Management', isTenantMgmt: true },
];

// ── Screenshot all views ──────────────────────────────────────────────────────
async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

const browser = await chromium.launch({
  executablePath: '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});

const page = await context.newPage();
const captured = [];

for (const view of VIEWS) {
  const safeName = view.label.replace(/[^a-z0-9]/gi, '_');
  const file = path.join(OUT_DIR, `${safeName}.png`);
  try {
    await page.goto(view.url, { waitUntil: 'networkidle', timeout: 20000 });
    await delay(1200);
    await page.screenshot({ path: file, fullPage: false });
    captured.push({ ...view, file });
    console.log(`✓ ${view.label}`);
  } catch (e) {
    console.error(`✗ ${view.label}: ${e.message}`);
  }
}

await browser.close();
console.log(`\nCaptured ${captured.length}/${VIEWS.length} screenshots`);

// ── Build Word document ───────────────────────────────────────────────────────
console.log('\nBuilding Word document…');

const BRAND  = '1E3A5F';
const ACCENT = '2563EB';
const AMBER  = 'D97706';
const GREY   = '64748B';

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 160 },
    children: [new TextRun({ text, bold: true, size: 40, color: BRAND })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, size: 30, color: ACCENT })],
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text, size: 22, color: '374151', ...opts })],
  });
}

function badgePara(text, color) {
  return new Paragraph({
    spacing: { before: 40, after: 120 },
    shading: { type: ShadingType.CLEAR, color: 'F8FAFC' },
    border: {
      top:    { style: BorderStyle.SINGLE, size: 4, color },
      bottom: { style: BorderStyle.SINGLE, size: 4, color },
      left:   { style: BorderStyle.SINGLE, size: 4, color },
      right:  { style: BorderStyle.SINGLE, size: 4, color },
    },
    indent: { left: 100, right: 100 },
    children: [new TextRun({ text, bold: true, size: 20, color })],
  });
}

const docChildren = [];

// Cover page
docChildren.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 1200, after: 300 },
    children: [new TextRun({ text: 'BusinessOS', bold: true, size: 80, color: BRAND })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 200 },
    children: [new TextRun({ text: 'Complete Screen Reference', size: 44, color: GREY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 200 },
    children: [new TextRun({ text: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), size: 24, color: '94A3B8', italics: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 300, after: 200 },
    children: [
      new TextRun({ text: 'Tenant Admin screens  \u2022  ', size: 22, color: ACCENT }),
      new TextRun({ text: 'Superuser Tenant Management screens', size: 22, color: AMBER }),
    ],
  }),
  new Paragraph({ children: [new PageBreak()] }),
);

// Screen index
docChildren.push(h1('Screen Index'));
let idx = 1;
let currentSection = '';
for (const s of captured) {
  if (s.section !== currentSection) {
    currentSection = s.section;
    docChildren.push(p(`\n${s.section}`, { bold: true, color: BRAND }));
  }
  const icon = s.isTenantMgmt ? '[SUPERUSER]' : '[ADMIN]';
  docChildren.push(p(`   ${idx++}.  ${icon}  ${s.label}`, { color: '374151' }));
}
docChildren.push(new Paragraph({ children: [new PageBreak()] }));

// Screen pages
let screenNum = 1;
currentSection = '';
for (const s of captured) {
  if (s.section !== currentSection) {
    currentSection = s.section;
    docChildren.push(h1(s.section));
  }

  docChildren.push(h2(`${screenNum++}. ${s.label}`));

  if (s.label === 'Login Page') {
    docChildren.push(badgePara('AUTHENTICATION — Public, no login required', GREY));
  } else if (s.isTenantMgmt) {
    docChildren.push(badgePara('SUPERUSER SCREEN — Accessible only to the platform superuser (tenantId = null)', AMBER));
    docChildren.push(p('Used to create, view, and manage tenant organisations. Credentials: stephen.raj@insead.edu / stryker', { color: '78350F', italics: true }));
  } else {
    docChildren.push(badgePara('TENANT ADMIN SCREEN — Requires login as tenant admin or standard user', ACCENT));
    docChildren.push(p(`Section: ${s.section}  |  Credentials: stephen.raj@coryphaeus.ai / admin123`, { color: '6B7280', italics: true }));
  }

  if (fs.existsSync(s.file)) {
    const imageData = fs.readFileSync(s.file);
    docChildren.push(
      new Paragraph({
        spacing: { before: 120, after: 200 },
        children: [
          new ImageRun({
            data: imageData,
            transformation: { width: 620, height: 388 },
            type: 'png',
          }),
        ],
      }),
    );
  } else {
    docChildren.push(p('[Screenshot not available]', { color: 'EF4444', italics: true }));
  }

  docChildren.push(new Paragraph({ children: [new PageBreak()] }));
}

// Legend
docChildren.push(
  h1('Legend'),
  p('[ADMIN]  Tenant Admin Screen', { bold: true }),
  p('Accessible after logging in as a tenant admin or standard user.'),
  p('Email: stephen.raj@coryphaeus.ai  |  Password: admin123'),
  new Paragraph({ spacing: { before: 200, after: 80 }, children: [] }),
  p('[SUPERUSER]  Tenant Management Screen', { bold: true }),
  p('Accessible only after logging in as the platform superuser (tenantId = null).'),
  p('Email: stephen.raj@insead.edu  |  Password: stryker'),
  new Paragraph({ spacing: { before: 200, after: 80 }, children: [] }),
  p(`Total screens captured: ${captured.length}`, { color: GREY }),
);

const doc = new Document({
  creator: 'BusinessOS',
  title: 'BusinessOS — Complete Screen Reference',
  sections: [{
    properties: {
      page: {
        margin: {
          top:    convertInchesToTwip(0.75),
          bottom: convertInchesToTwip(0.75),
          left:   convertInchesToTwip(0.8),
          right:  convertInchesToTwip(0.8),
        },
      },
    },
    children: docChildren,
  }],
});

const docBuffer = await Packer.toBuffer(doc);
const docPath = path.join(OUT_DIR, 'BusinessOS-Screens.docx');
fs.writeFileSync(docPath, docBuffer);

console.log(`\nWord document saved: ${docPath}`);
console.log(`Screens: ${captured.length}  |  Size: ${(docBuffer.length / 1024).toFixed(1)} KB`);
