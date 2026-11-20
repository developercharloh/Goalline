import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import {
  GetManualDepositConfigResponse, GetManualDepositsResponse, GetManualDepositReviewsResponse, ReviewManualDepositBody,
  ReviewManualDepositParams, ReviewManualDepositResponse,
} from "@workspace/api-zod";
import { identity } from "../lib/wallet-identity.js";
import {
  ManualDepositError, manualDepositConfig, reviewerEmailAllowed, depositResponse,
  listManualDeposits, decideManualDeposit,
} from "../lib/manual-deposits.js";

const router: IRouter = Router();
router.get("/probet/manual-deposits/config", (_req, res) => {
  res.json(GetManualDepositConfigResponse.parse(manualDepositConfig()));
});

// Never trust a user ID, email or role supplied by the browser.
async function requireReviewer(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) {
    res.status(403).json({ error: "Deposit review is not configured. Only an authorised reviewer may access this page." }); return;
  }
  const userId = getAuth(req).userId;
  if (!userId) { res.status(403).json({ error: "Sign in with your authorised reviewer account to review deposits." }); return; }
  try {
    const user = await clerkClient.users.getUser(userId);
    if (!reviewerEmailAllowed(user.emailAddresses)) {
      res.status(403).json({ error: "Your account is not authorised to review deposits." }); return;
    }
    res.locals.reviewerId = userId;
    next();
  } catch {
    res.status(503).json({ error: "Reviewer access could not be verified. Please try again." });
  }
}

router.get("/probet/manual-deposits/reviews", requireReviewer, async (_req, res): Promise<void> => {
  res.json(GetManualDepositReviewsResponse.parse((await listManualDeposits()).map(depositResponse)));
});
router.get("/probet/manual-deposits", async (req, res): Promise<void> => {
  const { owner } = await identity(req, res);
  res.json(GetManualDepositsResponse.parse((await listManualDeposits(owner)).map(depositResponse)));
});
router.post("/probet/manual-deposits", (_req, res): void => {
  res.status(410).json({ error: "This deposit option is no longer available." });
});
router.post("/probet/manual-deposits/:id/review", requireReviewer, async (req, res): Promise<void> => {
  const params = ReviewManualDepositParams.safeParse(req.params);
  const input = ReviewManualDepositBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Provide a valid reference, decision, verification checkbox and review note." }); return; }
  try {
    const row = await decideManualDeposit(params.data.id, res.locals.reviewerId, input.data);
    res.json(ReviewManualDepositResponse.parse(depositResponse(row)));
  } catch (error) {
    if (!(error instanceof ManualDepositError)) throw error;
    res.status(error.status).json({ error: error.message });
  }
});
export default router;
