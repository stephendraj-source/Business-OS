import { Router } from "express";

const router = Router();

const OPERATON_REST_BASE = "http://localhost:8080/engine-rest";
const OPERATON_USER = process.env.OPERATON_USER ?? "demo";
const OPERATON_PASSWORD = process.env.OPERATON_PASSWORD ?? "demo";
const DEFAULT_HISTORY_TTL_DAYS = process.env.OPERATON_DEFAULT_HISTORY_TTL ?? "180";

function operatonAuthHeader() {
  return `Basic ${Buffer.from(`${OPERATON_USER}:${OPERATON_PASSWORD}`).toString("base64")}`;
}

function ensureHistoryTtl(xml: string) {
  let next = xml;

  if (!next.includes("xmlns:operaton=")) {
    next = next.replace(
      /<bpmn:definitions\b/,
      '<bpmn:definitions xmlns:operaton="http://operaton.org/schema/1.0/bpmn"',
    );
  }

  next = next.replace(/<bpmn:process\b([^>]*)>/g, (match, attrs: string) => {
    if (/operaton:historyTimeToLive=/.test(attrs)) {
      return match;
    }
    return `<bpmn:process${attrs} operaton:historyTimeToLive="${DEFAULT_HISTORY_TTL_DAYS}">`;
  });

  return next;
}

async function readUpstreamJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function deployXmlToOperaton({
  deploymentName,
  fileName,
  xml,
}: {
  deploymentName?: unknown;
  fileName?: unknown;
  xml: string;
}) {
  const safeDeploymentName = typeof deploymentName === "string" && deploymentName.trim()
    ? deploymentName.trim()
    : "Business OS BPMN Deployment";
  const safeFileName = typeof fileName === "string" && fileName.trim()
    ? fileName.trim().replace(/[^a-zA-Z0-9._-]/g, "_")
    : "process.bpmn";

  const xmlWithTtl = ensureHistoryTtl(xml);

  const form = new FormData();
  form.append("deployment-name", safeDeploymentName);
  form.append("deploy-changed-only", "false");
  form.append("enable-duplicate-filtering", "false");
  form.append(safeFileName, new Blob([xmlWithTtl], { type: "text/xml" }), safeFileName);

  const upstream = await fetch(`${OPERATON_REST_BASE}/deployment/create`, {
    method: "POST",
    headers: {
      Authorization: operatonAuthHeader(),
    },
    body: form,
  });

  const payload = await readUpstreamJson(upstream);
  return { upstream, payload };
}

router.post("/operaton/deploy", async (req, res) => {
  try {
    const { deploymentName, fileName, xml } = req.body ?? {};

    if (typeof xml !== "string" || !xml.trim()) {
      return res.status(400).json({ error: "BPMN XML is required" });
    }

    const { upstream, payload } = await deployXmlToOperaton({ deploymentName, fileName, xml });

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error:
          typeof payload === "object" && payload !== null && "message" in payload
            ? String((payload as { message?: unknown }).message ?? "Operaton deployment failed")
            : "Operaton deployment failed",
        details: payload,
      });
    }

    return res.json({
      deployment: payload,
      message: "Deployment created successfully",
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Operaton deployment failed",
    });
  }
});

router.get("/operaton/processes/:processKey/instances", async (req, res) => {
  try {
    const processKey = req.params.processKey?.trim();
    if (!processKey) {
      return res.status(400).json({ error: "Process key is required" });
    }

    const upstream = await fetch(
      `${OPERATON_REST_BASE}/process-instance?processDefinitionKey=${encodeURIComponent(processKey)}&active=true`,
      {
        headers: {
          Authorization: operatonAuthHeader(),
        },
      },
    );

    const payload = await readUpstreamJson(upstream);
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: "Failed to fetch process instances",
        details: payload,
      });
    }

    const instances = Array.isArray(payload) ? payload : [];
    return res.json({
      count: instances.length,
      instances,
      latestInstanceId: instances[0]?.id ?? null,
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to fetch process instances",
    });
  }
});

router.post("/operaton/processes/:processKey/start", async (req, res) => {
  try {
    const processKey = req.params.processKey?.trim();
    if (!processKey) {
      return res.status(400).json({ error: "Process key is required" });
    }

    const upstream = await fetch(
      `${OPERATON_REST_BASE}/process-definition/key/${encodeURIComponent(processKey)}/start`,
      {
        method: "POST",
        headers: {
          Authorization: operatonAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body ?? {}),
      },
    );

    const payload = await readUpstreamJson(upstream);
    if (upstream.status === 404 && typeof req.body?.xml === "string" && req.body.xml.trim()) {
      const deployment = await deployXmlToOperaton({
        deploymentName: req.body?.deploymentName,
        fileName: req.body?.fileName,
        xml: req.body.xml,
      });

      if (!deployment.upstream.ok) {
        return res.status(deployment.upstream.status).json({
          error: "Failed to deploy process before start",
          details: deployment.payload,
        });
      }

      const retry = await fetch(
        `${OPERATON_REST_BASE}/process-definition/key/${encodeURIComponent(processKey)}/start`,
        {
          method: "POST",
          headers: {
            Authorization: operatonAuthHeader(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );

      const retryPayload = await readUpstreamJson(retry);
      if (!retry.ok) {
        return res.status(retry.status).json({
          error: "Failed to start process after deployment",
          details: retryPayload,
        });
      }

      return res.json({
        autoDeployed: true,
        deployment: deployment.payload,
        instance: retryPayload,
      });
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: "Failed to start process",
        details: payload,
      });
    }

    return res.json(payload);
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to start process",
    });
  }
});

router.post("/operaton/processes/:processKey/stop", async (req, res) => {
  try {
    const processKey = req.params.processKey?.trim();
    if (!processKey) {
      return res.status(400).json({ error: "Process key is required" });
    }

    const instancesRes = await fetch(
      `${OPERATON_REST_BASE}/process-instance?processDefinitionKey=${encodeURIComponent(processKey)}&active=true`,
      {
        headers: {
          Authorization: operatonAuthHeader(),
        },
      },
    );
    const instancesPayload = await readUpstreamJson(instancesRes);
    if (!instancesRes.ok) {
      return res.status(instancesRes.status).json({
        error: "Failed to query running instances",
        details: instancesPayload,
      });
    }

    const instances = Array.isArray(instancesPayload) ? instancesPayload as Array<{ id: string; startTime?: string }> : [];
    if (instances.length === 0) {
      return res.status(404).json({ error: "No active instances found for this process" });
    }

    const sorted = [...instances].sort((a, b) => (b.startTime ?? "").localeCompare(a.startTime ?? ""));
    const latest = sorted[0];

    const deleteRes = await fetch(`${OPERATON_REST_BASE}/process-instance/${encodeURIComponent(latest.id)}`, {
      method: "DELETE",
      headers: {
        Authorization: operatonAuthHeader(),
      },
    });

    if (!deleteRes.ok) {
      const deletePayload = await readUpstreamJson(deleteRes);
      return res.status(deleteRes.status).json({
        error: "Failed to stop process instance",
        details: deletePayload,
      });
    }

    return res.json({
      stoppedInstanceId: latest.id,
      message: "Stopped latest active process instance",
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to stop process",
    });
  }
});

export default router;
