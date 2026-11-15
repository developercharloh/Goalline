import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import cookieParser from "cookie-parser";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware.js";

const app: Express = express();
const clerkConfigured = Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.set("trust proxy", 1);
if (clerkConfigured) {
  app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
}
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required for demo sessions.");
const parseCookies = cookieParser(process.env.SESSION_SECRET);
app.use((req, res, next) => {
  // Vercel pre-parses cookies; cookie-parser otherwise skips setting the
  // signing secret and validating signed guest sessions.
  delete req.cookies;
  delete req.signedCookies;
  parseCookies(req, res, next);
});
if (clerkConfigured) {
  app.use(clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })));
}

app.use("/api", router);
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log.error({ err }, "Request failed");
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

export default app;
