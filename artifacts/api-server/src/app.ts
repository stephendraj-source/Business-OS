import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { createProxyMiddleware } from "http-proxy-middleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middleware/auth.js";

const app: Express = express();

const OPERATON_BASE = "http://localhost:8080";

function rewriteOperatonUrl(value: string): string {
  return value
    .replaceAll(`${OPERATON_BASE}/operaton/`, "/operaton/")
    .replaceAll("http://localhost:8080/operaton/", "/operaton/");
}

export const operatonProxy = createProxyMiddleware({
  target: OPERATON_BASE,
  changeOrigin: true,
  ws: false,
  pathRewrite: (path) => `/operaton${path}`,
  on: {
    proxyRes(proxyRes) {
      delete proxyRes.headers["x-frame-options"];
      delete proxyRes.headers["X-Frame-Options"];

      const csp = proxyRes.headers["content-security-policy"];
      if (typeof csp === "string") {
        proxyRes.headers["content-security-policy"] = csp.replace(
          /frame-ancestors[^;]*(;|$)/i,
          "frame-ancestors *$1",
        );
      }

      const location = proxyRes.headers.location;
      if (typeof location === "string") {
        proxyRes.headers.location = rewriteOperatonUrl(location);
      }
    },
  },
});

app.use("/operaton", operatonProxy);

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
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(authMiddleware);
app.use("/api", router);

export default app;
