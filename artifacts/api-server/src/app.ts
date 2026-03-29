import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { createProxyMiddleware } from "http-proxy-middleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middleware/auth.js";

const app: Express = express();

// ── n8n auto-login — synchronous cookie cache with background refresh ─────────
const N8N_BASE = "http://localhost:9000";
const N8N_EMAIL = process.env.N8N_AUTO_EMAIL ?? "stephen.d.raj@gmail.com";
const N8N_PASSWORD = process.env.N8N_AUTO_PASSWORD ?? "n8n-auto-2024!";

// These are read synchronously in the proxyReq handler — no await needed.
let n8nToken: string | null = null;
let n8nTokenExpiry = 0;
let n8nRefreshing = false;

function refreshN8nToken(): void {
  if (n8nRefreshing) return;
  n8nRefreshing = true;

  fetch(`${N8N_BASE}/rest/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emailOrLdapLoginId: N8N_EMAIL, password: N8N_PASSWORD }),
  })
    .then(async (res) => {
      const setCookie = res.headers.get("set-cookie");
      if (res.ok && setCookie) {
        const match = setCookie.match(/n8n-auth=([^;]+)/);
        if (match) {
          n8nToken = match[1];
          // Cache for 6 days (token expires in 7 days by default)
          n8nTokenExpiry = Date.now() + 6 * 24 * 60 * 60 * 1000;
        }
      }
    })
    .catch((err) => logger.warn({ err }, "n8n auto-login failed"))
    .finally(() => { n8nRefreshing = false; });
}

// Warm up immediately and every 6 days
refreshN8nToken();
setInterval(refreshN8nToken, 6 * 24 * 60 * 60 * 1000);

// ── n8n reverse proxy — auto-inject auth cookie + strip framing headers ───────
app.use(
  "/n8n",
  createProxyMiddleware({
    target: N8N_BASE,
    changeOrigin: true,
    ws: true,
    on: {
      proxyReq(proxyReq) {
        // Refresh token if it has expired
        if (!n8nToken || Date.now() > n8nTokenExpiry) refreshN8nToken();

        // Inject the cached n8n auth cookie synchronously
        if (n8nToken) {
          const existing = proxyReq.getHeader("cookie") as string | undefined;
          const merged = existing
            ? `${existing}; n8n-auth=${n8nToken}`
            : `n8n-auth=${n8nToken}`;
          proxyReq.setHeader("cookie", merged);
        }
      },
      proxyRes(proxyRes) {
        delete proxyRes.headers["x-frame-options"];
        delete proxyRes.headers["X-Frame-Options"];
        // Relax CSP frame-ancestors so the iframe can embed n8n
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
