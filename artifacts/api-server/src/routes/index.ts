import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import probetRouter from "./probet.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(probetRouter);

export default router;
