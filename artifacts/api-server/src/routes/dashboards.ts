import { Router } from 'express';
import { db, users } from '@workspace/db';
import { dashboardsTable, dashboardShares } from '@workspace/db';
import { userGroups, groupRoles } from '@workspace/db';
import { eq, or, inArray, and } from 'drizzle-orm';
import { anthropic } from '@workspace/integrations-anthropic-ai';
import { useCredit } from '../lib/credits';

export const dashboardsRouter = Router();

function getAuth(req: any): { userId: number | null; tenantId: number | null; role: string | null } {
  const auth = req.auth;
  if (auth) return { userId: auth.userId, tenantId: auth.tenantId, role: auth.role };
  const h = req.headers['x-user-id'];
  return { userId: h ? parseInt(h as string) : null, tenantId: null, role: null };
}

async function getAccessibleDashboardIds(userId: number | null, tenantId: number | null, role: string | null) {
  if (!userId) return [];
  if (role === 'admin' || role === 'superuser') {
    const query = db.select({ id: dashboardsTable.id }).from(dashboardsTable);
    const all = tenantId
      ? await query.where(eq(dashboardsTable.tenantId, tenantId))
      : await query;
    return all.map(d => d.id);
  }
  const userGroupRows = await db.select({ groupId: userGroups.groupId }).from(userGroups).where(eq(userGroups.userId, userId));
  const groupIds = userGroupRows.map(r => r.groupId);
  const userGroupRoles = groupIds.length > 0
    ? await db.select({ roleId: groupRoles.roleId }).from(groupRoles).where(inArray(groupRoles.groupId, groupIds))
    : [];
  const roleIds = userGroupRoles.map(r => r.roleId);

  const shareConditions = [eq(dashboardShares.sharedWithUserId, userId)];
  if (roleIds.length) shareConditions.push(inArray(dashboardShares.sharedWithRoleId, roleIds));
  if (groupIds.length) shareConditions.push(inArray(dashboardShares.sharedWithGroupId, groupIds));

  const ownedQuery = db.select({ id: dashboardsTable.id }).from(dashboardsTable)
    .where(tenantId
      ? and(eq(dashboardsTable.createdBy, userId), eq(dashboardsTable.tenantId, tenantId))
      : eq(dashboardsTable.createdBy, userId));

  const [owned, shared] = await Promise.all([
    ownedQuery,
    db.select({ dashboardId: dashboardShares.dashboardId }).from(dashboardShares).where(or(...shareConditions)),
  ]);
  return [...new Set([...owned.map(d => d.id), ...shared.map(d => d.dashboardId)])];
}

dashboardsRouter.get('/dashboards', async (req, res) => {
  try {
    const { userId, tenantId, role } = getAuth(req);
    if (!userId) return res.json([]);
    const ids = await getAccessibleDashboardIds(userId, tenantId, role);
    if (!ids.length) return res.json([]);
    const dashboards = await db.select().from(dashboardsTable).where(inArray(dashboardsTable.id, ids));
    const sharesRows = await db.select().from(dashboardShares).where(inArray(dashboardShares.dashboardId, ids));
    const result = dashboards.map(d => ({
      ...d,
      isOwner: d.createdBy === userId,
      canEdit: d.createdBy === userId || sharesRows.some(s => s.dashboardId === d.id && s.canEdit && s.sharedWithUserId === userId),
      shares: sharesRows.filter(s => s.dashboardId === d.id),
    }));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

dashboardsRouter.post('/dashboards', async (req, res) => {
  try {
    const { userId, tenantId } = getAuth(req);
    const { name = 'My Dashboard', widgets = [], aiPrompt = '' } = req.body;
    const [row] = await db.insert(dashboardsTable).values({ name, widgets, aiPrompt, createdBy: userId, tenantId }).returning();
    res.status(201).json({ ...row, isOwner: true, canEdit: true, shares: [] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

dashboardsRouter.patch('/dashboards/:id', async (req, res) => {
  try {
    const { userId, tenantId, role } = getAuth(req);
    const id = parseInt(req.params.id);
    const dashboard = await db.select().from(dashboardsTable).where(eq(dashboardsTable.id, id));
    if (!dashboard.length) return res.status(404).json({ error: 'Not found' });
    if (tenantId && dashboard[0].tenantId !== tenantId) return res.status(403).json({ error: 'Access denied' });
    const isOwner = dashboard[0].createdBy === userId;
    const shares = await db.select().from(dashboardShares).where(eq(dashboardShares.dashboardId, id));
    const canEdit = isOwner || role === 'admin' || shares.some(s => s.canEdit && s.sharedWithUserId === userId);
    if (!canEdit) return res.status(403).json({ error: 'No edit access' });
    const { name, widgets, aiPrompt } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (widgets !== undefined) updates.widgets = widgets;
    if (aiPrompt !== undefined) updates.aiPrompt = aiPrompt;
    const [updated] = await db.update(dashboardsTable).set(updates).where(eq(dashboardsTable.id, id)).returning();
    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

dashboardsRouter.delete('/dashboards/:id', async (req, res) => {
  try {
    const { userId, tenantId, role } = getAuth(req);
    const id = parseInt(req.params.id);
    const dashboard = await db.select().from(dashboardsTable).where(eq(dashboardsTable.id, id));
    if (!dashboard.length) return res.status(404).json({ error: 'Not found' });
    if (tenantId && dashboard[0].tenantId !== tenantId) return res.status(403).json({ error: 'Access denied' });
    const isOwner = dashboard[0].createdBy === userId;
    if (!isOwner && role !== 'admin') return res.status(403).json({ error: 'No delete access' });
    await db.delete(dashboardsTable).where(eq(dashboardsTable.id, id));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

dashboardsRouter.get('/dashboards/:id/shares', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const shares = await db.select().from(dashboardShares).where(eq(dashboardShares.dashboardId, id));
    res.json(shares);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

dashboardsRouter.put('/dashboards/:id/shares', async (req, res) => {
  try {
    const { userId, tenantId, role } = getAuth(req);
    const id = parseInt(req.params.id);
    const dashboard = await db.select().from(dashboardsTable).where(eq(dashboardsTable.id, id));
    if (!dashboard.length) return res.status(404).json({ error: 'Not found' });
    if (tenantId && dashboard[0].tenantId !== tenantId) return res.status(403).json({ error: 'Access denied' });
    const isOwner = dashboard[0].createdBy === userId;
    if (!isOwner && role !== 'admin') return res.status(403).json({ error: 'No share access' });
    const { shares } = req.body as { shares: { sharedWithUserId?: number; sharedWithRoleId?: number; sharedWithGroupId?: number; canEdit: boolean }[] };
    await db.delete(dashboardShares).where(eq(dashboardShares.dashboardId, id));
    if (shares?.length) {
      await db.insert(dashboardShares).values(shares.map(s => ({ dashboardId: id, ...s })));
    }
    const result = await db.select().from(dashboardShares).where(eq(dashboardShares.dashboardId, id));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

const PRESET_OPTIONS = [
  { id: 'summary',         label: 'Process Summary',               description: 'Portfolio totals and category counts' },
  { id: 'categories',      label: 'Category Breakdown',            description: 'Processes by category (clickable to map)' },
  { id: 'performance',     label: 'Performance Overview',          description: 'KPI, Target and Actual per process' },
  { id: 'ai-agents',       label: 'AI Agent Map',                  description: 'AI agents assigned across processes' },
  { id: 'value-impact',    label: 'Value Impact',                  description: 'Processes with value impact data' },
  { id: 'recent-activity', label: 'Recent Activity',               description: 'Latest audit log entries' },
];

const CHART_METRIC_OPTIONS = [
  { id: 'processes-by-category',  label: 'Processes by Category',             charts: ['bar','horizontal-bar','line','area','pie','donut'] },
  { id: 'portfolio-status',       label: 'Portfolio Status (in/out)',          charts: ['donut','pie','bar'] },
  { id: 'ai-agent-distribution',  label: 'AI Agent Distribution',             charts: ['horizontal-bar','bar','pie','donut'] },
  { id: 'data-completeness',      label: 'Data Completeness by Category',     charts: ['bar','horizontal-bar'] },
  { id: 'governance-coverage',    label: 'Governance Coverage',               charts: ['donut','pie'] },
  { id: 'kpi-coverage',           label: 'KPI Coverage',                      charts: ['pie','donut','bar'] },
  { id: 'target-coverage',        label: 'Target Coverage',                   charts: ['pie','donut','bar'] },
  { id: 'value-impact-coverage',  label: 'Value Impact Coverage',             charts: ['pie','donut'] },
  { id: 'category-portfolio',     label: 'Included vs Excluded by Category',  charts: ['bar'] },
  { id: 'audit-by-action',        label: 'Activity by Action Type',           charts: ['bar','horizontal-bar'] },
];

dashboardsRouter.post('/dashboards/ai-generate', async (req, res) => {
  try {
    const { tenantId } = getAuth(req);
    const { prompt } = req.body as { prompt: string };
    if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' });

    if (tenantId) {
      const credit = await useCredit(tenantId);
      if (!credit.ok) return res.status(402).json({ error: 'Insufficient credits.' });
    }

    const presetList  = PRESET_OPTIONS.map(p => `- ${p.id}: ${p.label} — ${p.description}`).join('\n');
    const metricList  = CHART_METRIC_OPTIONS.map(m => `- ${m.id}: ${m.label} (charts: ${m.charts.join(', ')})`).join('\n');

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 700,
      messages: [{
        role: 'user',
        content: `You are helping a user configure a business process dashboard. Based on their request, select the best combination of preset panels and chart widgets to show.

Available preset panels (use exact id values):
${presetList}

Available chart metrics (use exact id values, choose first listed chart type as default):
${metricList}

User request: "${prompt}"

Return ONLY valid JSON (no markdown, no explanation):
{
  "name": "Dashboard name (concise, max 50 chars)",
  "description": "One sentence describing what this dashboard shows",
  "presets": ["preset-id1", "preset-id2"],
  "charts": [
    { "metric": "metric-id", "chartType": "bar", "title": "Chart title" }
  ]
}

Choose 2-5 total items (presets + charts combined). Always use exact id values from the lists above.`,
      }],
    });

    const text = message.content.map((c: any) => c.type === 'text' ? c.text : '').join('').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI returned invalid response' });

    const config = JSON.parse(jsonMatch[0]) as {
      name: string;
      description: string;
      presets: string[];
      charts: { metric: string; chartType: string; title: string }[];
    };

    const validPresets = new Set(PRESET_OPTIONS.map(p => p.id));
    const validMetrics = new Set(CHART_METRIC_OPTIONS.map(m => m.id));
    const validChartTypes = new Set(['bar','horizontal-bar','line','area','pie','donut']);

    const safePresets = (config.presets ?? []).filter(p => validPresets.has(p));
    const safeCharts  = (config.charts  ?? []).filter(c => validMetrics.has(c.metric) && validChartTypes.has(c.chartType));

    res.json({
      name:        config.name        ?? '',
      description: config.description ?? '',
      presets:     safePresets,
      charts:      safeCharts,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'AI generation failed' });
  }
});
