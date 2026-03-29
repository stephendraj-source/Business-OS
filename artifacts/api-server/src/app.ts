import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { createProxyMiddleware } from "http-proxy-middleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middleware/auth.js";

const app: Express = express();

// ── n8n reverse proxy — strip X-Frame-Options so it embeds in the app ────────
app.use(
  "/n8n",
  createProxyMiddleware({
    target: "http://localhost:9000",
    changeOrigin: true,
    ws: true,
    on: {
      proxyRes(proxyRes) {
        delete proxyRes.headers["x-frame-options"];
        delete proxyRes.headers["X-Frame-Options"];
        // Relax CSP frame-ancestors for iframe embedding
        const csp = proxyRes.headers["content-security-policy"];
        if (typeof csp === "string") {
          proxyRes.headers["content-security-policy"] = csp.replace(
            /frame-ancestors[^;]*(;|$)/i,
            "frame-ancestors *$1",
          );
        }
      },
    },
  }),
);

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
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(authMiddleware);
app.use("/api", router);

export default app;
