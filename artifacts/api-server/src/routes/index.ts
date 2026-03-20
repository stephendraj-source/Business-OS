import { Router, type IRouter } from "express";
import healthRouter from "./health";
import processesRouter from "./processes";
import anthropicRouter from "./anthropic";
import auditLogsRouter from "./audit-logs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(processesRouter);
router.use(anthropicRouter);
router.use(auditLogsRouter);

export default router;
