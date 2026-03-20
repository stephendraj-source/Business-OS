import { Router, type IRouter } from "express";
import healthRouter from "./health";
import processesRouter from "./processes";
import anthropicRouter from "./anthropic";
import auditLogsRouter from "./audit-logs";
import governanceRouter from "./governance";

const router: IRouter = Router();

router.use(healthRouter);
router.use(governanceRouter);
router.use(processesRouter);
router.use(anthropicRouter);
router.use(auditLogsRouter);

export default router;
