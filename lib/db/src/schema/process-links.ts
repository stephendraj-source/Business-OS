import { pgTable, serial, integer } from 'drizzle-orm/pg-core';
import { processesTable } from './processes';
import { aiAgentsTable } from './ai-agents';
import { workflowsTable } from './workflows';

export const processLinkedAgents = pgTable('process_linked_agents', {
  id: serial('id').primaryKey(),
  processId: integer('process_id').notNull().references(() => processesTable.id, { onDelete: 'cascade' }),
  agentId: integer('agent_id').notNull().references(() => aiAgentsTable.id, { onDelete: 'cascade' }),
});

export const processLinkedWorkflows = pgTable('process_linked_workflows', {
  id: serial('id').primaryKey(),
  processId: integer('process_id').notNull().references(() => processesTable.id, { onDelete: 'cascade' }),
  workflowId: integer('workflow_id').notNull().references(() => workflowsTable.id, { onDelete: 'cascade' }),
});
