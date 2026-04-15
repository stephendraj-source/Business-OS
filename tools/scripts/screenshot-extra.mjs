import { chromium } from 'playwright';
import fs from 'fs';
const APP = 'http://localhost:80';
const ADMIN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEzLCJ0ZW5hbnRJZCI6Miwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzc0MjY2NTc1LCJleHAiOjE3NzY4NTg1NzV9.nJ1_xCd4UCuF5hbCP0qoJ3hVKP6iFHOnBUpuwUoy0K8';
const OUT = '/tmp/screenshots';
const delay = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome',
  headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const snap = async name => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log(`✓ ${name}`); };

// Workflows: click first workflow item in sidebar list
await page.goto(`${APP}/?token=${ADMIN}&view=workflows`, { waitUntil:'networkidle', timeout:20000 });
await delay(1000);
// Use nth(0) to get first workflow list item 
try {
  await page.locator('text="New Workflow"').first().click({ timeout: 5000 });
  await delay(1500);
  await snap('Workflows_Designer_Open');
} catch(e) { console.log('workflows click failed:', e.message.split('\n')[0]); }

// Documents: new document type menu
await page.goto(`${APP}/?token=${ADMIN}&view=forms`, { waitUntil:'networkidle', timeout:20000 });
await delay(1000);
try {
  await page.locator('button:has-text("New")').click({ timeout: 5000 });
  await delay(800);
  await snap('Documents_New_Type_Menu');
  // List any popup menu items
  const items = await page.locator('[role="menuitem"]').all();
  for (const item of items) console.log('  menu item:', await item.textContent());
  if (items.length > 0) {
    await items[0].click();
    await delay(1200);
    await snap('Documents_New_Item_Created');
  }
} catch(e) { console.log('docs new failed:', e.message.split('\n')[0]); }

// Master Map: click Finance category, then click a process
await page.goto(`${APP}/?token=${ADMIN}&view=tree`, { waitUntil:'networkidle', timeout:20000 });
await delay(1000);
try {
  await page.locator('text="Finance & Compliance"').click({ timeout: 5000 });
  await delay(1500);
  // Take screenshot with category expanded
  await snap('Master_Map_Finance_Category_Open');
  // Try clicking first item in right panel
  const rightPanelBtns = page.locator('div.flex-1 button, div.overflow-auto button').filter({ hasText: /\w+/ });
  const count = await rightPanelBtns.count();
  console.log('Right panel buttons:', count);
  if (count > 0) {
    await rightPanelBtns.first().click({ timeout: 3000 });
    await delay(1200);
    await snap('Master_Map_Process_In_Panel');
  }
} catch(e) { console.log('master map failed:', e.message.split('\n')[0]); }

await browser.close();
console.log('Done.');
