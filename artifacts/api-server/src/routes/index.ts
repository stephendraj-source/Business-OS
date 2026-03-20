import { Router, type IRouter } from "express";
import healthRouter from "./health";
import processesRouter from "./processes";
import anthropicRouter from "./anthropic";
import auditLogsRouter from "./audit-logs";
import governanceRouter from "./governance";
import aiAgentsRouter from "./ai-agents";
import workflowsRouter from "./workflows";

const router: IRouter = Router();

router.use(healthRouter);
router.use(governanceRouter);
router.use(processesRouter);
router.use(anthropicRouter);
router.use(auditLogsRouter);
router.use(aiAgentsRouter);
router.use(workflowsRouter);

export default router;
