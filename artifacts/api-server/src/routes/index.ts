import { Router, type IRouter } from "express";
import healthRouter from "./health";
import processesRouter from "./processes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(processesRouter);

export default router;
