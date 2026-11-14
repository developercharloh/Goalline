import { Router, type IRouter } from "express";
import healthRouter from "./health";
import probetRouter from "./probet";

const router: IRouter = Router();

router.use(healthRouter);
router.use(probetRouter);

export default router;
