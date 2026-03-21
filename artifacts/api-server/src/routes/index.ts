import { Router, type IRouter } from "express";
import healthRouter from "./health";
import processesRouter from "./processes";
import anthropicRouter from "./anthropic";
import auditLogsRouter from "./audit-logs";
import governanceRouter from "./governance";
import aiAgentsRouter from "./ai-agents";
import workflowsRouter from "./workflows";
import checklistsRouter from "./checklists";
import { usersRouter } from "./users";
import { orgRouter } from "./org";
import { initiativesRouter } from "./initiatives";

const router: IRouter = Router();

router.use(healthRouter);
router.use(governanceRouter);
router.use(processesRouter);
router.use(anthropicRouter);
router.use(auditLogsRouter);
router.use(aiAgentsRouter);
router.use(workflowsRouter);
router.use(checklistsRouter);
router.use('/users', usersRouter);
router.use(orgRouter);
router.use(initiativesRouter);

export default router;
