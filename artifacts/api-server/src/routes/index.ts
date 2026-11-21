import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import probetRouter from "./probet.js";
import payheroRouter from "./payhero.js";
import authRouter from "./auth.js";
import adminRouter from "./admin.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(probetRouter);
router.use(payheroRouter);

export default router;
