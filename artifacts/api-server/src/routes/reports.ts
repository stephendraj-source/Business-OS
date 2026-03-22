import { Router } from 'express';
import { db, users, groups, roles } from '@workspace/db';
import { customReportsTable, reportShares } from '@workspace/db';
import { eq, or, inArray, and } from 'drizzle-orm';
import { userGroups, groupRoles } from '@workspace/db';
import { anthropic } from '@workspace/integrations-anthropic-ai';
import { useCredit } from '../lib/credits';

export const reportsRouter = Router();

function getAuth(req: any): { userId: number | null; tenantId: number | null; role: string | null } {
  const auth = req.auth;
  if (auth) return { userId: auth.userId, tenantId: auth.tenantId, role: auth.role };
  const h = req.headers['x-user-id'];
  return { userId: h ? parseInt(h as string) : null, tenantId: null, role: null };
}

async function getAccessibleReportIds(userId: number | null, tenantId: number | null, role: string | null) {
  if (!userId) return [];
  if (role === 'admin' || role === 'superuser') {
    const query = db.select({ id: customReportsTable.id }).from(customReportsTable);
    const all = tenantId
      ? await query.where(eq(customReportsTable.tenantId, tenantId))
      : await query;
    return all.map(r => r.id);
  }
  const userGroupRows = await db.select({ groupId: userGroups.groupId }).from(userGroups).where(eq(userGroups.userId, userId));
  const groupIds = userGroupRows.map(r => r.groupId);
  const userGroupRoles = groupIds.length > 0
    ? await db.select({ roleId: groupRoles.roleId }).from(groupRoles).where(inArray(groupRoles.groupId, groupIds))
    : [];
  const roleIds = userGroupRoles.map(r => r.roleId);

  const shareConditions = [eq(reportShares.sharedWithUserId, userId)];
  if (roleIds.length) shareConditions.push(inArray(reportShares.sharedWithRoleId, roleIds));
  if (groupIds.length) shareConditions.push(inArray(reportShares.sharedWithGroupId, groupIds));

  const ownedQuery = db.select({ id: customReportsTable.id }).from(customReportsTable)
    .where(tenantId
      ? and(eq(customReportsTable.createdBy, userId), eq(customReportsTable.tenantId, tenantId))
      : eq(customReportsTable.createdBy, userId));

  const [owned, shared] = await Promise.all([
    ownedQuery,
    db.select({ reportId: reportShares.reportId }).from(reportShares).where(or(...shareConditions)),
  ]);
  return [...new Set([...owned.map(r => r.id), ...shared.map(r => r.reportId)])];
}

reportsRouter.get('/reports', async (req, res) => {
  try {
    const { userId, tenantId, role } = getAuth(req);
    if (!userId) return res.json([]);
    const ids = await getAccessibleReportIds(userId, tenantId, role);
    if (!ids.length) return res.json([]);
    const reports = await db.select().from(customReportsTable).where(inArray(customReportsTable.id, ids));
    const sharesRows = await db.select().from(reportShares).where(inArray(reportShares.reportId, ids));
    const result = reports.map(r => ({
      ...r,
      isOwner: r.createdBy === userId,
      canEdit: r.createdBy === userId || sharesRows.some(s => s.reportId === r.id && s.canEdit && s.sharedWithUserId === userId),
      shares: sharesRows.filter(s => s.reportId === r.id),
    }));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

reportsRouter.post('/reports', async (req, res) => {
  try {
    const { userId, tenantId } = getAuth(req);
    const { title, description = '', type = 'table', fields = [] } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const [row] = await db.insert(customReportsTable).values({ title, description, type, fields, createdBy: userId, tenantId }).returning();
    res.status(201).json({ ...row, isOwner: true, canEdit: true, shares: [] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

reportsRouter.patch('/reports/:id', async (req, res) => {
  try {
    const { userId, tenantId, role } = getAuth(req);
    const id = parseInt(req.params.id);
    const reportQuery = db.select().from(customReportsTable).where(eq(customReportsTable.id, id));
    const report = await reportQuery;
    if (!report.length) return res.status(404).json({ error: 'Not found' });
    if (tenantId && report[0].tenantId !== tenantId) return res.status(403).json({ error: 'Access denied' });
    const isOwner = report[0].createdBy === userId;
    const shares = await db.select().from(reportShares).where(eq(reportShares.reportId, id));
    const canEdit = isOwner || role === 'admin' || shares.some(s => s.canEdit && s.sharedWithUserId === userId);
    if (!canEdit) return res.status(403).json({ error: 'No edit access' });
    const { title, description, type, fields } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (type !== undefined) updates.type = type;
    if (fields !== undefined) updates.fields = fields;
    const [updated] = await db.update(customReportsTable).set(updates).where(eq(customReportsTable.id, id)).returning();
    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

reportsRouter.delete('/reports/:id', async (req, res) => {
  try {
    const { userId, tenantId, role } = getAuth(req);
    const id = parseInt(req.params.id);
    const report = await db.select().from(customReportsTable).where(eq(customReportsTable.id, id));
    if (!report.length) return res.status(404).json({ error: 'Not found' });
    if (tenantId && report[0].tenantId !== tenantId) return res.status(403).json({ error: 'Access denied' });
    const isOwner = report[0].createdBy === userId;
    if (!isOwner && role !== 'admin') return res.status(403).json({ error: 'No delete access' });
    await db.delete(customReportsTable).where(eq(customReportsTable.id, id));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

reportsRouter.get('/reports/:id/shares', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const shares = await db.select().from(reportShares).where(eq(reportShares.reportId, id));
    res.json(shares);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

reportsRouter.put('/reports/:id/shares', async (req, res) => {
  try {
    const { userId, tenantId, role } = getAuth(req);
    const id = parseInt(req.params.id);
    const report = await db.select().from(customReportsTable).where(eq(customReportsTable.id, id));
    if (!report.length) return res.status(404).json({ error: 'Not found' });
    if (tenantId && report[0].tenantId !== tenantId) return res.status(403).json({ error: 'Access denied' });
    const isOwner = report[0].createdBy === userId;
    if (!isOwner && role !== 'admin') return res.status(403).json({ error: 'No share access' });
    const { shares } = req.body as { shares: { sharedWithUserId?: number; sharedWithRoleId?: number; sharedWithGroupId?: number; canEdit: boolean }[] };
    await db.delete(reportShares).where(eq(reportShares.reportId, id));
    if (shares?.length) {
      await db.insert(reportShares).values(shares.map(s => ({ reportId: id, ...s })));
    }
    const result = await db.select().from(reportShares).where(eq(reportShares.reportId, id));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

const AVAILABLE_FIELDS = [
  { key: 'processId',            label: 'Process ID' },
  { key: 'category',             label: 'Category' },
  { key: 'processName',          label: 'Process Name' },
  { key: 'description',          label: 'Description' },
  { key: 'aiAgent',              label: 'AI Agent' },
  { key: 'purpose',              label: 'Purpose' },
  { key: 'inputs',               label: 'Inputs' },
  { key: 'outputs',              label: 'Outputs' },
  { key: 'humanInTheLoop',       label: 'Human-in-the-Loop' },
  { key: 'kpi',                  label: 'KPI' },
  { key: 'target',               label: 'Target' },
  { key: 'achievement',          label: 'Achievement' },
  { key: 'trafficLight',         label: 'Traffic Light' },
  { key: 'estimatedValueImpact', label: 'Value Impact' },
  { key: 'industryBenchmark',    label: 'Benchmark' },
  { key: 'included',             label: 'In Portfolio' },
  { key: 'completeness',         label: 'Completeness' },
  { key: 'status',               label: 'Status' },
  { key: 'fieldsFilled',         label: 'Fields Filled' },
];

reportsRouter.post('/reports/ai-generate', async (req, res) => {
  try {
    const { userId, tenantId } = getAuth(req);
    const { prompt } = req.body as { prompt: string };
    if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' });

    if (tenantId) {
      const credit = await useCredit(tenantId);
      if (!credit.ok) return res.status(402).json({ error: 'Insufficient credits.' });
    }

    const fieldList = AVAILABLE_FIELDS.map(f => `- ${f.key}: ${f.label}`).join('\n');

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `You are helping a user create a custom process report. Based on their request, generate a report configuration.

Available fields (use the exact key values):
${fieldList}

User request: "${prompt}"

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "name": "Report name (concise, max 50 chars)",
  "description": "Brief description of what this report shows",
  "fields": ["key1", "key2", ...]
}

Always include processId, category, and processName as the first three fields. Choose additional fields that make sense for the request. Ensure all field keys are from the available list above.`,
      }],
    });

    const text = message.content.map((c: any) => c.type === 'text' ? c.text : '').join('').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI returned invalid response' });

    const config = JSON.parse(jsonMatch[0]) as { name: string; description: string; fields: string[] };
    const validKeys = new Set(AVAILABLE_FIELDS.map(f => f.key));
    const safeFields = (config.fields ?? []).filter((k: string) => validKeys.has(k));

    res.json({ name: config.name ?? '', description: config.description ?? '', fields: safeFields });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'AI generation failed' });
  }
});
