import { Router } from 'express';
import {
  db,
  processesTable,
  aiAgentsTable, agentKnowledgeUrlsTable, agentKnowledgeFilesTable,
  agentSchedulesTable, agentModuleAccess, agentAllowedCategories,
  agentAllowedProcesses, agentFieldPermissions,
  workflowsTable,
  groups, roles, businessUnits, regions,
  groupRoles, groupBusinessUnits, groupRegions,
  roleBusinessUnits, roleRegions, roleModuleAccess,
  roleAllowedCategories, roleAllowedProcesses, roleFieldPermissions,
  governanceStandardsTable, governanceDocumentsTable, processGovernanceTable,
  checklistsTable, checklistItemsTable,
  customReportsTable, dashboardsTable,
  initiatives, initiativeUrls, initiativeProcesses,
} from '@workspace/db';
import { eq, inArray } from 'drizzle-orm';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

export const blueprintRouter = Router();

// ── EXPORT ─────────────────────────────────────────────────────────────────────

blueprintRouter.get('/blueprint/export', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tenantId = req.auth!.tenantId!;

    const [
      procs,
      agents,
      wflows,
      grps,
      rls,
      bus,
      rgns,
      govStandards,
      govDocs,
      procGov,
      chklists,
      dashboards,
      reports,
      inits,
    ] = await Promise.all([
      db.select().from(processesTable).where(eq(processesTable.tenantId, tenantId)),
      db.select().from(aiAgentsTable).where(eq(aiAgentsTable.tenantId, tenantId)),
      db.select().from(workflowsTable).where(eq(workflowsTable.tenantId, tenantId)),
      db.select().from(groups).where(eq(groups.tenantId, tenantId)),
      db.select().from(roles).where(eq(roles.tenantId, tenantId)),
      db.select().from(businessUnits).where(eq(businessUnits.tenantId, tenantId)),
      db.select().from(regions).where(eq(regions.tenantId, tenantId)),
      db.select().from(governanceStandardsTable).where(eq(governanceStandardsTable.tenantId, tenantId)),
      db.select().from(governanceDocumentsTable).where(eq(governanceDocumentsTable.tenantId, tenantId)),
      db.select().from(processGovernanceTable).where(eq(processGovernanceTable.tenantId, tenantId)),
      db.select().from(checklistsTable).where(eq(checklistsTable.tenantId, tenantId)),
      db.select().from(dashboardsTable).where(eq(dashboardsTable.tenantId, tenantId)),
      db.select().from(customReportsTable).where(eq(customReportsTable.tenantId, tenantId)),
      db.select().from(initiatives).where(eq(initiatives.tenantId, tenantId)),
    ]);

    const agentIds = agents.map((a: any) => a.id);
    const grpIds = grps.map((g: any) => g.id);
    const rlIds = rls.map((r: any) => r.id);
    const chkIds = chklists.map((c: any) => c.id);
    const initIds = inits.map((i: any) => i.id);

    const [
      agentUrls, agentFiles, agentSchedules,
      agentModAccess, agentAllowedCats, agentAllowedProcs, agentFieldPerms,
      grpRoles, grpBus, grpRgns,
      rlBus, rlRgns, rlModAccess, rlAllowedCats, rlAllowedProcs, rlFieldPerms,
      chkItems,
      initUrls, initProcs,
    ] = await Promise.all([
      agentIds.length ? db.select().from(agentKnowledgeUrlsTable).where(inArray(agentKnowledgeUrlsTable.agentId, agentIds)) : Promise.resolve([]),
      agentIds.length ? db.select().from(agentKnowledgeFilesTable).where(inArray(agentKnowledgeFilesTable.agentId, agentIds)) : Promise.resolve([]),
      agentIds.length ? db.select().from(agentSchedulesTable).where(inArray(agentSchedulesTable.agentId, agentIds)) : Promise.resolve([]),
      agentIds.length ? db.select().from(agentModuleAccess).where(inArray(agentModuleAccess.agentId, agentIds)) : Promise.resolve([]),
      agentIds.length ? db.select().from(agentAllowedCategories).where(inArray(agentAllowedCategories.agentId, agentIds)) : Promise.resolve([]),
      agentIds.length ? db.select().from(agentAllowedProcesses).where(inArray(agentAllowedProcesses.agentId, agentIds)) : Promise.resolve([]),
      agentIds.length ? db.select().from(agentFieldPermissions).where(inArray(agentFieldPermissions.agentId, agentIds)) : Promise.resolve([]),
      grpIds.length ? db.select().from(groupRoles).where(inArray(groupRoles.groupId, grpIds)) : Promise.resolve([]),
      grpIds.length ? db.select().from(groupBusinessUnits).where(inArray(groupBusinessUnits.groupId, grpIds)) : Promise.resolve([]),
      grpIds.length ? db.select().from(groupRegions).where(inArray(groupRegions.groupId, grpIds)) : Promise.resolve([]),
      rlIds.length ? db.select().from(roleBusinessUnits).where(inArray(roleBusinessUnits.roleId, rlIds)) : Promise.resolve([]),
      rlIds.length ? db.select().from(roleRegions).where(inArray(roleRegions.roleId, rlIds)) : Promise.resolve([]),
      rlIds.length ? db.select().from(roleModuleAccess).where(inArray(roleModuleAccess.roleId, rlIds)) : Promise.resolve([]),
      rlIds.length ? db.select().from(roleAllowedCategories).where(inArray(roleAllowedCategories.roleId, rlIds)) : Promise.resolve([]),
      rlIds.length ? db.select().from(roleAllowedProcesses).where(inArray(roleAllowedProcesses.roleId, rlIds)) : Promise.resolve([]),
      rlIds.length ? db.select().from(roleFieldPermissions).where(inArray(roleFieldPermissions.roleId, rlIds)) : Promise.resolve([]),
      chkIds.length ? db.select().from(checklistItemsTable).where(inArray(checklistItemsTable.checklistId, chkIds)) : Promise.resolve([]),
      initIds.length ? db.select().from(initiativeUrls).where(inArray(initiativeUrls.initiativeId, initIds)) : Promise.resolve([]),
      initIds.length ? db.select().from(initiativeProcesses).where(inArray(initiativeProcesses.initiativeId, initIds)) : Promise.resolve([]),
    ]);

    const blueprint = {
      _meta: {
        version: 1,
        exportedAt: new Date().toISOString(),
        exportedByTenantId: tenantId,
      },
      processes: procs,
      aiAgents: agents,
      agentKnowledgeUrls: agentUrls,
      agentKnowledgeFiles: agentFiles,
      agentSchedules,
      agentModuleAccess: agentModAccess,
      agentAllowedCategories: agentAllowedCats,
      agentAllowedProcesses: agentAllowedProcs,
      agentFieldPermissions: agentFieldPerms,
      workflows: wflows,
      groups: grps,
      roles: rls,
      businessUnits: bus,
      regions: rgns,
      groupRoles: grpRoles,
      groupBusinessUnits: grpBus,
      groupRegions: grpRgns,
      roleBusinessUnits: rlBus,
      roleRegions: rlRgns,
      roleModuleAccess: rlModAccess,
      roleAllowedCategories: rlAllowedCats,
      roleAllowedProcesses: rlAllowedProcs,
      roleFieldPermissions: rlFieldPerms,
      governanceStandards: govStandards,
      governanceDocuments: govDocs,
      processGovernance: procGov,
      checklists: chklists,
      checklistItems: chkItems,
      dashboards,
      reports,
      initiatives: inits,
      initiativeUrls: initUrls,
      initiativeProcesses: initProcs,
    };

    res.json(blueprint);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── IMPORT ─────────────────────────────────────────────────────────────────────

blueprintRouter.post('/blueprint/import', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tenantId = req.auth!.tenantId!;
    const bp = req.body;

    if (!bp || bp._meta?.version !== 1) {
      return res.status(400).json({ error: 'Invalid blueprint file. Expected version 1.' });
    }

    function strip(row: any): any {
      const { id: _id, tenantId: _t, ...rest } = row;
      return rest;
    }

    // ── 1. Collect existing IDs for junction deletion ──────────────────────────

    const [
      existingAgents,
      existingGroups,
      existingRoles,
      existingBUs,
      existingRgns,
      existingChklists,
      existingInits,
    ] = await Promise.all([
      db.select({ id: aiAgentsTable.id }).from(aiAgentsTable).where(eq(aiAgentsTable.tenantId, tenantId)),
      db.select({ id: groups.id }).from(groups).where(eq(groups.tenantId, tenantId)),
      db.select({ id: roles.id }).from(roles).where(eq(roles.tenantId, tenantId)),
      db.select({ id: businessUnits.id }).from(businessUnits).where(eq(businessUnits.tenantId, tenantId)),
      db.select({ id: regions.id }).from(regions).where(eq(regions.tenantId, tenantId)),
      db.select({ id: checklistsTable.id }).from(checklistsTable).where(eq(checklistsTable.tenantId, tenantId)),
      db.select({ id: initiatives.id }).from(initiatives).where(eq(initiatives.tenantId, tenantId)),
    ]);

    const eAgentIds = existingAgents.map(a => a.id);
    const eGroupIds = existingGroups.map(g => g.id);
    const eRoleIds = existingRoles.map(r => r.id);
    const eBUIds = existingBUs.map(b => b.id);
    const eRgnIds = existingRgns.map(r => r.id);
    const eChkIds = existingChklists.map(c => c.id);
    const eInitIds = existingInits.map(i => i.id);

    // ── 2. Delete junction tables (FK order) ───────────────────────────────────

    if (eAgentIds.length) {
      await Promise.all([
        db.delete(agentKnowledgeUrlsTable).where(inArray(agentKnowledgeUrlsTable.agentId, eAgentIds)),
        db.delete(agentKnowledgeFilesTable).where(inArray(agentKnowledgeFilesTable.agentId, eAgentIds)),
        db.delete(agentSchedulesTable).where(inArray(agentSchedulesTable.agentId, eAgentIds)),
        db.delete(agentModuleAccess).where(inArray(agentModuleAccess.agentId, eAgentIds)),
        db.delete(agentAllowedCategories).where(inArray(agentAllowedCategories.agentId, eAgentIds)),
        db.delete(agentAllowedProcesses).where(inArray(agentAllowedProcesses.agentId, eAgentIds)),
        db.delete(agentFieldPermissions).where(inArray(agentFieldPermissions.agentId, eAgentIds)),
      ]);
    }
    if (eGroupIds.length) {
      await Promise.all([
        db.delete(groupRoles).where(inArray(groupRoles.groupId, eGroupIds)),
        db.delete(groupBusinessUnits).where(inArray(groupBusinessUnits.groupId, eGroupIds)),
        db.delete(groupRegions).where(inArray(groupRegions.groupId, eGroupIds)),
      ]);
    }
    if (eRoleIds.length) {
      await Promise.all([
        db.delete(roleBusinessUnits).where(inArray(roleBusinessUnits.roleId, eRoleIds)),
        db.delete(roleRegions).where(inArray(roleRegions.roleId, eRoleIds)),
        db.delete(roleModuleAccess).where(inArray(roleModuleAccess.roleId, eRoleIds)),
        db.delete(roleAllowedCategories).where(inArray(roleAllowedCategories.roleId, eRoleIds)),
        db.delete(roleAllowedProcesses).where(inArray(roleAllowedProcesses.roleId, eRoleIds)),
        db.delete(roleFieldPermissions).where(inArray(roleFieldPermissions.roleId, eRoleIds)),
      ]);
    }
    if (eChkIds.length) {
      await db.delete(checklistItemsTable).where(inArray(checklistItemsTable.checklistId, eChkIds));
    }
    if (eInitIds.length) {
      await Promise.all([
        db.delete(initiativeUrls).where(inArray(initiativeUrls.initiativeId, eInitIds)),
        db.delete(initiativeProcesses).where(inArray(initiativeProcesses.initiativeId, eInitIds)),
      ]);
    }

    // ── 3. Delete base tables ──────────────────────────────────────────────────

    await Promise.all([
      eAgentIds.length ? db.delete(aiAgentsTable).where(inArray(aiAgentsTable.id, eAgentIds)) : Promise.resolve(),
      eGroupIds.length ? db.delete(groups).where(inArray(groups.id, eGroupIds)) : Promise.resolve(),
      eRoleIds.length ? db.delete(roles).where(inArray(roles.id, eRoleIds)) : Promise.resolve(),
      eBUIds.length ? db.delete(businessUnits).where(inArray(businessUnits.id, eBUIds)) : Promise.resolve(),
      eRgnIds.length ? db.delete(regions).where(inArray(regions.id, eRgnIds)) : Promise.resolve(),
      eChkIds.length ? db.delete(checklistsTable).where(inArray(checklistsTable.id, eChkIds)) : Promise.resolve(),
      eInitIds.length ? db.delete(initiatives).where(inArray(initiatives.id, eInitIds)) : Promise.resolve(),
      db.delete(processesTable).where(eq(processesTable.tenantId, tenantId)),
      db.delete(workflowsTable).where(eq(workflowsTable.tenantId, tenantId)),
      db.delete(governanceStandardsTable).where(eq(governanceStandardsTable.tenantId, tenantId)),
      db.delete(governanceDocumentsTable).where(eq(governanceDocumentsTable.tenantId, tenantId)),
      db.delete(processGovernanceTable).where(eq(processGovernanceTable.tenantId, tenantId)),
      db.delete(dashboardsTable).where(eq(dashboardsTable.tenantId, tenantId)),
      db.delete(customReportsTable).where(eq(customReportsTable.tenantId, tenantId)),
    ]);

    // ── 4. Insert base entities, capture ID maps ───────────────────────────────

    const procMap = new Map<number, number>();
    const agentMap = new Map<number, number>();
    const grpMap = new Map<number, number>();
    const rlMap = new Map<number, number>();
    const buMap = new Map<number, number>();
    const rgnMap = new Map<number, number>();
    const chkMap = new Map<number, number>();
    const initMap = new Map<number, number>();
    const govStdMap = new Map<number, number>();
    const govDocMap = new Map<number, number>();

    async function insertMapped(table: any, rows: any[], idMap: Map<number, number>, extra: Record<string, any> = {}) {
      if (!rows?.length) return;
      for (const row of rows) {
        const oldId = row.id;
        const [inserted] = await db.insert(table).values({ ...strip(row), ...extra }).returning();
        idMap.set(oldId, inserted.id);
      }
    }

    async function insertSimple(table: any, rows: any[], extra: Record<string, any> = {}) {
      if (!rows?.length) return;
      for (const row of rows) {
        await db.insert(table).values({ ...strip(row), ...extra });
      }
    }

    await insertMapped(processesTable, bp.processes, procMap, { tenantId });
    await insertMapped(aiAgentsTable, bp.aiAgents, agentMap, { tenantId });
    await insertSimple(workflowsTable, bp.workflows, { tenantId });
    await insertMapped(groups, bp.groups, grpMap, { tenantId });
    await insertMapped(roles, bp.roles, rlMap, { tenantId });
    await insertMapped(businessUnits, bp.businessUnits, buMap, { tenantId });
    await insertMapped(regions, bp.regions, rgnMap, { tenantId });
    await insertMapped(checklistsTable, bp.checklists, chkMap, { tenantId });
    await insertMapped(initiatives, bp.initiatives, initMap, { tenantId });
    await insertMapped(governanceStandardsTable, bp.governanceStandards, govStdMap, { tenantId });
    await insertMapped(governanceDocumentsTable, bp.governanceDocuments, govDocMap, { tenantId });

    // Process governance (remapped FKs)
    for (const pg of (bp.processGovernance || [])) {
      const newProcId = procMap.get(pg.processId);
      if (!newProcId) continue;
      await db.insert(processGovernanceTable).values({
        ...strip(pg),
        tenantId,
        processId: newProcId,
        standardId: pg.standardId ? (govStdMap.get(pg.standardId) ?? null) : null,
        documentId: pg.documentId ? (govDocMap.get(pg.documentId) ?? null) : null,
      });
    }

    // Dashboards + reports (stored as JSON config, no remapping needed)
    for (const d of (bp.dashboards || [])) {
      await db.insert(dashboardsTable).values({ ...strip(d), tenantId });
    }
    for (const r of (bp.reports || [])) {
      await db.insert(customReportsTable).values({ ...strip(r), tenantId });
    }

    // ── 5. Insert junction/dependent tables with remapped IDs ──────────────────

    for (const u of (bp.agentKnowledgeUrls || [])) {
      const newId = agentMap.get(u.agentId);
      if (newId) await db.insert(agentKnowledgeUrlsTable).values({ ...strip(u), agentId: newId });
    }
    for (const f of (bp.agentKnowledgeFiles || [])) {
      const newId = agentMap.get(f.agentId);
      if (newId) await db.insert(agentKnowledgeFilesTable).values({ ...strip(f), agentId: newId });
    }
    for (const s of (bp.agentSchedules || [])) {
      const newId = agentMap.get(s.agentId);
      if (newId) await db.insert(agentSchedulesTable).values({ ...strip(s), agentId: newId });
    }
    for (const m of (bp.agentModuleAccess || [])) {
      const newId = agentMap.get(m.agentId);
      if (newId) await db.insert(agentModuleAccess).values({ ...strip(m), agentId: newId });
    }
    for (const c of (bp.agentAllowedCategories || [])) {
      const newId = agentMap.get(c.agentId);
      if (newId) await db.insert(agentAllowedCategories).values({ ...strip(c), agentId: newId });
    }
    for (const p of (bp.agentAllowedProcesses || [])) {
      const newId = agentMap.get(p.agentId);
      const newProcId = procMap.get(p.processId) ?? p.processId;
      if (newId) await db.insert(agentAllowedProcesses).values({ ...strip(p), agentId: newId, processId: newProcId });
    }
    for (const fp of (bp.agentFieldPermissions || [])) {
      const newId = agentMap.get(fp.agentId);
      if (newId) await db.insert(agentFieldPermissions).values({ ...strip(fp), agentId: newId });
    }

    for (const gr of (bp.groupRoles || [])) {
      const newGrpId = grpMap.get(gr.groupId);
      const newRlId = rlMap.get(gr.roleId);
      if (newGrpId && newRlId) await db.insert(groupRoles).values({ groupId: newGrpId, roleId: newRlId });
    }
    for (const gb of (bp.groupBusinessUnits || [])) {
      const newGrpId = grpMap.get(gb.groupId);
      const newBuId = buMap.get(gb.businessUnitId);
      if (newGrpId && newBuId) await db.insert(groupBusinessUnits).values({ groupId: newGrpId, businessUnitId: newBuId });
    }
    for (const grg of (bp.groupRegions || [])) {
      const newGrpId = grpMap.get(grg.groupId);
      const newRgnId = rgnMap.get(grg.regionId);
      if (newGrpId && newRgnId) await db.insert(groupRegions).values({ groupId: newGrpId, regionId: newRgnId });
    }
    for (const rb of (bp.roleBusinessUnits || [])) {
      const newRlId = rlMap.get(rb.roleId);
      const newBuId = buMap.get(rb.businessUnitId);
      if (newRlId && newBuId) await db.insert(roleBusinessUnits).values({ roleId: newRlId, businessUnitId: newBuId });
    }
    for (const rr of (bp.roleRegions || [])) {
      const newRlId = rlMap.get(rr.roleId);
      const newRgnId = rgnMap.get(rr.regionId);
      if (newRlId && newRgnId) await db.insert(roleRegions).values({ roleId: newRlId, regionId: newRgnId });
    }
    for (const rm of (bp.roleModuleAccess || [])) {
      const newRlId = rlMap.get(rm.roleId);
      if (newRlId) await db.insert(roleModuleAccess).values({ ...strip(rm), roleId: newRlId });
    }
    for (const rc of (bp.roleAllowedCategories || [])) {
      const newRlId = rlMap.get(rc.roleId);
      if (newRlId) await db.insert(roleAllowedCategories).values({ ...strip(rc), roleId: newRlId });
    }
    for (const rp of (bp.roleAllowedProcesses || [])) {
      const newRlId = rlMap.get(rp.roleId);
      const newProcId = procMap.get(rp.processId) ?? rp.processId;
      if (newRlId) await db.insert(roleAllowedProcesses).values({ ...strip(rp), roleId: newRlId, processId: newProcId });
    }
    for (const rfp of (bp.roleFieldPermissions || [])) {
      const newRlId = rlMap.get(rfp.roleId);
      if (newRlId) await db.insert(roleFieldPermissions).values({ ...strip(rfp), roleId: newRlId });
    }

    for (const ci of (bp.checklistItems || [])) {
      const newChkId = chkMap.get(ci.checklistId);
      if (newChkId) await db.insert(checklistItemsTable).values({ ...strip(ci), checklistId: newChkId });
    }
    for (const iu of (bp.initiativeUrls || [])) {
      const newInitId = initMap.get(iu.initiativeId);
      if (newInitId) await db.insert(initiativeUrls).values({ ...strip(iu), initiativeId: newInitId });
    }
    for (const ip of (bp.initiativeProcesses || [])) {
      const newInitId = initMap.get(ip.initiativeId);
      const newProcId = procMap.get(ip.processId) ?? ip.processId;
      if (newInitId) await db.insert(initiativeProcesses).values({ initiativeId: newInitId, processId: newProcId });
    }

    res.json({
      ok: true,
      summary: {
        processes: procMap.size,
        aiAgents: agentMap.size,
        groups: grpMap.size,
        roles: rlMap.size,
        businessUnits: buMap.size,
        regions: rgnMap.size,
        checklists: chkMap.size,
        initiatives: initMap.size,
      },
    });
  } catch (e: any) {
    console.error('[blueprint import error]', e);
    res.status(500).json({ error: e.message });
  }
});
