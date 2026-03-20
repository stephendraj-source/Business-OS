import { Router, type IRouter } from "express";
import healthRouter from "./health";
import processesRouter from "./processes";
import anthropicRouter from "./anthropic";

const router: IRouter = Router();

router.use(healthRouter);
router.use(processesRouter);
router.use(anthropicRouter);

export default router;
