/**
 * Capture interactive/drill-down states:
 * - Process Map & Master Map click-through
 * - Add modals (Initiatives, Documents, Governance, Strategic Planning, etc.)
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const APP = 'http://localhost:80';
const ADMIN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEzLCJ0ZW5hbnRJZCI6Miwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzc0MjY2NTc1LCJleHAiOjE3NzY4NTg1NzV9.nJ1_xCd4UCuF5hbCP0qoJ3hVKP6iFHOnBUpuwUoy0K8';
const OUT = '/tmp/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const delay = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

async function go(view) {
  await page.goto(`${APP}/?token=${ADMIN}&view=${view}`, { waitUntil: 'networkidle', timeout: 20000 });
  await delay(1000);
}

async function snap(name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`✓ ${name}`);
  return file;
}

// ── MASTER MAP: click a category ─────────────────────────────────────────────
await go('tree');
await page.click('text="Finance & Compliance"');
await delay(1500);
await snap('Master_Map_Category_Finance');

// click into a subcategory/process if the right panel expanded
try {
  // Click the first arrow/chevron to drill into Finance & Compliance
  await page.click('.text-\\[\\#4ECDC4\\], button[aria-label*="expand"], [data-category]', { timeout: 3000 });
  await delay(1200);
  await snap('Master_Map_Category_Drilldown');
} catch {}

// ── PROCESS MAP: click a category → process list ──────────────────────────────
await go('process-map');
await page.click('text="Technology & Data"');
await delay(1500);
await snap('Process_Map_Category_Technology');

// Now click the first process in the list to show its detail
try {
  await page.click('.flex-1 button, [role="button"]:has-text("IT Monitoring"), button:has-text("IT Monitoring")', { timeout: 4000 });
  await delay(1200);
  await snap('Process_Map_Process_Detail');
} catch {
  // Try clicking first list item in the right panel
  try {
    await page.click('>> nth=0 >> button', { timeout: 3000 });
    await delay(1200);
    await snap('Process_Map_Process_Detail');
  } catch {}
}

// ── PROCESS MAP: second category ─────────────────────────────────────────────
await go('process-map');
await page.click('text="Technology & Data"');
await delay(1200);
// Try to click first process row shown on right panel
try {
  const rightPanel = page.locator('.flex-1').nth(1);
  await rightPanel.locator('button').first().click({ timeout: 4000 });
  await delay(1200);
  await snap('Process_Map_Process_Detail_Panel');
} catch {}

// ── MASTER MAP: Finance drilled ───────────────────────────────────────────────
await go('tree');
// Click Finance & Compliance to open its processes on the right
await page.locator('text="Finance & Compliance"').click();
await delay(1400);
await snap('Master_Map_Finance_Expanded');
// Click first process 
try {
  await page.locator('[data-radix-scroll-area-viewport] button, .overflow-y-auto button').first().click({ timeout: 4000 });
  await delay(1200);
  await snap('Master_Map_Process_Selected');
} catch {}

// ── STRATEGIC PLANNING: Add Goal modal ───────────────────────────────────────
await go('strategic-planning');
await page.click('button:has-text("Add Goal")');
await delay(1000);
await snap('Strategic_Planning_Add_Goal');
await page.keyboard.press('Escape');
await delay(500);

// ── STRATEGIC PLANNING: click existing goal to see detail ─────────────────────
await go('strategic-planning');
try {
  await page.locator('text="Increase revenue by 20%"').first().click();
  await delay(1200);
  await snap('Strategic_Planning_Goal_Detail');
} catch {}

// ── INITIATIVES: Add Initiative modal ─────────────────────────────────────────
await go('initiatives');
await page.click('button:has-text("Add Initiative")');
await delay(1000);
await snap('Initiatives_Add_Initiative');
await page.keyboard.press('Escape');
await delay(500);

// ── GOVERNANCE: Add Standard modal ────────────────────────────────────────────
await go('governance');
await page.click('button:has-text("Add Standard")');
await delay(1000);
await snap('Governance_Add_Standard');
await page.keyboard.press('Escape');
await delay(500);

// ── DOCUMENTS: New document creation ─────────────────────────────────────────
await go('forms');
await page.click('button:has-text("New")');
await delay(1000);
await snap('Documents_New_Document_Menu');
// Try selecting "Form" option
try {
  await page.click('text="Form", [role="menuitem"]:has-text("Form")', { timeout: 3000 });
  await delay(1200);
  await snap('Documents_New_Form_Created');
} catch {
  // Maybe it created a blank doc directly
  await delay(800);
  await snap('Documents_After_New_Click');
}

// ── DOCUMENTS: click an existing document to show editor ──────────────────────
await go('forms');
await delay(500);
try {
  // Click on Employee Handbook or first document
  await page.locator('text="Employee Handbook"').first().click();
  await delay(1500);
  await snap('Documents_View_Employee_Handbook');
} catch {}
try {
  await page.locator('text="Nonprofit Toolkit"').first().click();
  await delay(1500);
  await snap('Documents_View_Nonprofit_Toolkit');
} catch {}

// ── MEETINGS: Click existing meeting to see detail ────────────────────────────
await go('meetings');
await delay(500);
try {
  await page.locator('text="Q1 Board Review"').first().click();
  await delay(1200);
  await snap('Meetings_Q1_Board_Review_Detail');
} catch {}

// ── MEETINGS: New meeting ─────────────────────────────────────────────────────
await go('meetings');
await page.click('button:has-text("New")');
await delay(1000);
await snap('Meetings_New_Meeting_Detail');

// ── WORKFLOWS: click existing workflow to open designer ───────────────────────
await go('workflows');
await delay(500);
try {
  await page.locator('text="#1 New Workflow"').first().click();
  await delay(1500);
  await snap('Workflows_Designer_Open');
} catch {}

// ── AI AGENTS: click existing agent to show detail ────────────────────────────
await go('ai-agents');
await delay(500);
try {
  await page.locator('text="Onboarding Agent"').first().click();
  await delay(1500);
  await snap('AI_Agents_Onboarding_Detail');
} catch {}

// ── TASKS: click a task row to see detail ────────────────────────────────────
await go('tasks');
await delay(500);
try {
  await page.locator('text="Review Q1 financial report"').first().click();
  await delay(1200);
  await snap('Tasks_Detail_Panel');
} catch {}

// ── TASKS: New task modal ─────────────────────────────────────────────────────
await go('tasks');
await page.click('button:has-text("New Task")');
await delay(1000);
await snap('Tasks_New_Task_Modal');
await page.keyboard.press('Escape');

await browser.close();
console.log('\nDone.');
