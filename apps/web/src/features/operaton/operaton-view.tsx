import { useEffect, useMemo, useRef, useState } from "react";
import BpmnModeler from "bpmn-js/lib/Modeler";
import {
  Download,
  ExternalLink,
  FileUp,
  GitBranch,
  Loader2,
  Rocket,
  RotateCcw,
  WandSparkles,
} from "lucide-react";
import { useAuth } from "@/app/providers/AuthContext";
import { useProcessesData, useOptimisticUpdateProcess } from "@/shared/hooks/use-app-data";
import { useToast } from "@/shared/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";

const API = "/api";

function operatonWorkspaceUrl() {
  return "/operaton/app/cockpit/default/";
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function createTemplateXml(processName: string, processKey: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:operaton="http://operaton.org/schema/1.0/bpmn"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${processKey}" name="${processName}" isExecutable="true" operaton:historyTimeToLive="180">
    <bpmn:startEvent id="StartEvent_1" name="Start" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processKey}">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="179" y="99" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

function parseBpmnProcessMeta(xml: string) {
  const processTagMatch = xml.match(/<bpmn:process\b([^>]*)>/i);
  if (!processTagMatch) {
    return { key: "", name: "" };
  }

  const attrs = processTagMatch[1];
  const keyMatch = attrs.match(/\bid="([^"]+)"/i);
  const nameMatch = attrs.match(/\bname="([^"]+)"/i);

  return {
    key: keyMatch?.[1] ?? "",
    name: nameMatch?.[1] ?? "",
  };
}

function subprocessOptionLabel(process: { number: number; processName?: string | null; processDescription?: string | null; depth: number }) {
  const indent = process.depth > 0 ? `${"\u00A0\u00A0\u00A0".repeat(process.depth)}↳ ` : "";
  return `${indent}PRO-${String(process.number).padStart(3, "0")} ${process.processName || process.processDescription || "Unnamed Process"}`;
}

export function OperatonView() {
  const { fetchHeaders } = useAuth();
  const { toast } = useToast();
  const { data: processes = [] } = useProcessesData();
  const { mutateAsync: updateProcess } = useOptimisticUpdateProcess() as unknown as {
    mutateAsync: (args: { id: number; data: Record<string, unknown> }) => Promise<unknown>;
  };
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelerRef = useRef<BpmnModeler | null>(null);
  const [activeTab, setActiveTab] = useState("modeler");
  const [processName, setProcessName] = useState("");
  const [processKey, setProcessKey] = useState("");
  const [deploymentName, setDeploymentName] = useState("Business OS BPMN Deployment");
  const [isBooting, setIsBooting] = useState(true);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isStartingProcess, setIsStartingProcess] = useState(false);
  const [isStoppingProcess, setIsStoppingProcess] = useState(false);
  const [status, setStatus] = useState<string>("Starting BPMN modeler...");
  const [workspaceReloadKey, setWorkspaceReloadKey] = useState(0);
  const [workspaceState, setWorkspaceState] = useState<"idle" | "checking" | "ready" | "unavailable">("idle");
  const [workspaceError, setWorkspaceError] = useState("");
  const [selectedProcessId, setSelectedProcessId] = useState<string>("");
  const [isSavingBpmn, setIsSavingBpmn] = useState(false);
  const [activeInstanceCount, setActiveInstanceCount] = useState(0);
  const safeProcessKey = slugify(processKey) || "business_os_process";
  const initialProcessId = useMemo(
    () => new URLSearchParams(window.location.search).get("processId") ?? "",
    [],
  );
  const catalogueProcesses = useMemo(
    () =>
      [...processes]
        .filter((process) => process.included || (process as any).parentProcessId != null)
        .sort((a, b) => {
          const categoryCompare = a.category.localeCompare(b.category);
          if (categoryCompare !== 0) return categoryCompare;
          return a.number - b.number;
        }),
    [processes],
  );
  const catalogueProcessGroups = useMemo(() => {
    const groups = new Map<string, Array<(typeof catalogueProcesses)[number] & { depth: number }>>();

    for (const [category, categoryProcesses] of Array.from(
      catalogueProcesses.reduce((map, process) => {
        const existing = map.get(process.category) ?? [];
        existing.push(process);
        map.set(process.category, existing);
        return map;
      }, new Map<string, typeof catalogueProcesses>()),
    )) {
      const byParent = new Map<number | null, typeof catalogueProcesses>();
      for (const process of categoryProcesses) {
        const parentId = ((process as any).parentProcessId as number | null | undefined) ?? null;
        const existing = byParent.get(parentId) ?? [];
        existing.push(process);
        byParent.set(parentId, existing);
      }

      const ordered: Array<(typeof catalogueProcesses)[number] & { depth: number }> = [];
      const visit = (parentId: number | null, depth: number) => {
        const children = [...(byParent.get(parentId) ?? [])].sort((a, b) => a.number - b.number);
        for (const child of children) {
          ordered.push({ ...child, depth });
          visit(child.id, depth + 1);
        }
      };

      visit(null, 0);

      for (const process of [...categoryProcesses].sort((a, b) => a.number - b.number)) {
        if (!ordered.some((entry) => entry.id === process.id)) {
          ordered.push({ ...process, depth: 0 });
        }
      }

      groups.set(category, ordered);
    }
    return Array.from(groups.entries());
  }, [catalogueProcesses]);

  const starterXml = useMemo(
    () => createTemplateXml(processName, safeProcessKey),
    [processName, safeProcessKey],
  );
  const [currentXml, setCurrentXml] = useState<string>(starterXml);

  useEffect(() => {
    if (!modelerRef.current) {
      setCurrentXml(starterXml);
    }
  }, [starterXml]);

  const createModelerInstance = (host: HTMLDivElement) => {
    const existing = modelerRef.current;
    if (existing) {
      modelerRef.current = null;
      existing.destroy();
    }
    host.innerHTML = "";

    const modeler = new BpmnModeler({
      container: host,
      keyboard: { bindTo: window },
    });

    modelerRef.current = modeler;
    return modeler;
  };

  const destroyModelerInstance = () => {
    const existing = modelerRef.current;
    if (!existing) return;
    modelerRef.current = null;
    existing.destroy();
    canvasRef.current?.replaceChildren();
  };

  const fitDiagramToViewport = () => {
    const modeler = modelerRef.current;
    const canvasHost = canvasRef.current;
    if (!modeler || !canvasHost) return;

    const canvas = modeler.get("canvas") as {
      zoom: (level: "fit-viewport" | number) => void;
      resized?: () => void;
    };

    const tryFit = (attempt = 0) => {
      requestAnimationFrame(() => {
        const { clientWidth, clientHeight } = canvasHost;
        if (clientWidth <= 0 || clientHeight <= 0) {
          if (attempt < 3) {
            window.setTimeout(() => tryFit(attempt + 1), 60);
          }
          return;
        }

        try {
          canvas.resized?.();
          canvas.zoom("fit-viewport");
        } catch {
          try {
            canvas.zoom(1);
          } catch {
            // Keep the modeler usable even if automatic fitting fails.
          }
        }
      });
    };

    tryFit();
  };

  const reloadModelerFromXml = async (xml: string) => {
    const host = canvasRef.current;
    if (!host) return;
    await importXml(xml, { recreate: true });
  };

  useEffect(() => {
    const host = canvasRef.current;
    if (!host) return;

    let destroyed = false;
    let observer: ResizeObserver | null = null;

    const boot = async () => {
      if (destroyed || modelerRef.current) return;

      const modeler = createModelerInstance(host);

      try {
        await modeler.importXML(starterXml);
        fitDiagramToViewport();
        setStatus("Design a BPMN process, then deploy it straight into Operaton.");
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Failed to start BPMN modeler");
      } finally {
        if (!destroyed) {
          setIsBooting(false);
        }
      }
    };

    const maybeBoot = () => {
      if (destroyed) return;
      if (host.clientWidth > 0 && host.clientHeight > 0) {
        observer?.disconnect();
        observer = null;
        void boot();
      }
    };

    maybeBoot();

    if (!modelerRef.current) {
      observer = new ResizeObserver(() => maybeBoot());
      observer.observe(host);
    }

    return () => {
      destroyed = true;
      observer?.disconnect();
      const modeler = modelerRef.current;
      if (!modeler) return;
      modelerRef.current = null;
      modeler.destroy();
    };
  }, []);

  const importXml = async (xml: string, options?: { recreate?: boolean }) => {
    let modeler = modelerRef.current;
    const host = canvasRef.current;
    if (options?.recreate && host) {
      modeler = createModelerInstance(host);
    }
    if (!modeler) return;
    const meta = parseBpmnProcessMeta(xml);
    if (meta.name) {
      setProcessName(meta.name);
    }
    if (meta.key) {
      setProcessKey(meta.key);
    }
    await modeler.importXML(xml);
    setCurrentXml(xml);
    fitDiagramToViewport();
  };

  const refreshActiveInstances = async (key = safeProcessKey) => {
    if (!key) {
      setActiveInstanceCount(0);
      return;
    }

    try {
      const response = await fetch(`${API}/operaton/processes/${encodeURIComponent(key)}/instances`, {
        headers: {
          ...fetchHeaders(),
        },
      });
      if (!response.ok) {
        setActiveInstanceCount(0);
        return;
      }
      const payload = await response.json().catch(() => ({}));
      setActiveInstanceCount(Number(payload?.count ?? 0));
    } catch {
      setActiveInstanceCount(0);
    }
  };

  const loadProcessIntoModeler = async (processId: string) => {
    setSelectedProcessId(processId);
    const selected = catalogueProcesses.find((item) => String(item.id) === processId);
    if (!selected) return;

    const nextName = selected.processName || selected.processDescription || "Business OS Process";
    const nextKey = slugify(selected.processName || selected.processDescription || `process_${selected.number}`) || "business_os_process";
    setProcessName(nextName);
    setProcessKey(nextKey);

    if ((selected as any).bpmn) {
      await importXml((selected as any).bpmn, { recreate: true });
      setStatus(`Loaded BPMN for ${nextName}.`);
      return;
    }

    await importXml(createTemplateXml(nextName, nextKey), { recreate: true });
    setStatus(`Started a fresh BPMN diagram for ${nextName}.`);
  };

  useEffect(() => {
    if (!initialProcessId || selectedProcessId || catalogueProcesses.length === 0) return;
    void loadProcessIntoModeler(initialProcessId);
  }, [catalogueProcesses, initialProcessId, selectedProcessId]);

  useEffect(() => {
    if (activeTab === "workspace") {
      const modeler = modelerRef.current;
      if (!modeler) return;
      void modeler.saveXML({ format: true })
        .then(({ xml }) => {
          if (xml) {
            setCurrentXml(xml);
          }
        })
        .catch(() => {
          // Keep the last cached XML if serialization fails during tab switch.
        })
        .finally(() => {
          destroyModelerInstance();
        });
      return;
    }

    if (activeTab !== "modeler") return;

    requestAnimationFrame(() => {
      const host = canvasRef.current;
      if (!host) return;

      const modeler = modelerRef.current;
      if (!modeler) {
        void reloadModelerFromXml(currentXml || starterXml);
        return;
      }

      if (host.clientWidth <= 0 || host.clientHeight <= 0) {
        void reloadModelerFromXml(currentXml || starterXml);
        return;
      }

      fitDiagramToViewport();
    });
  }, [activeTab, currentXml, starterXml]);

  useEffect(() => {
    void refreshActiveInstances();
  }, [safeProcessKey]);

  useEffect(() => {
    if (activeTab !== "workspace") return;

    const controller = new AbortController();

    const checkWorkspace = async () => {
      setWorkspaceState("checking");
      setWorkspaceError("");

      try {
        const response = await fetch(operatonWorkspaceUrl(), {
          method: "GET",
          headers: {
            Accept: "text/html",
            ...fetchHeaders(),
          },
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Operaton workspace returned ${response.status}.`);
        }

        setWorkspaceState("ready");
      } catch (err) {
        if (controller.signal.aborted) return;

        setWorkspaceState("unavailable");
        setWorkspaceError(
          err instanceof Error
            ? err.message
            : "Unable to reach the Operaton workspace.",
        );
      }
    };

    void checkWorkspace();

    return () => controller.abort();
  }, [activeTab, workspaceReloadKey, fetchHeaders]);

  const resetDiagram = async () => {
    setStatus("Resetting diagram...");
    const host = canvasRef.current;
    if (!host) return;

    const modeler = createModelerInstance(host);
    const xml = createTemplateXml(processName, safeProcessKey);
    await modeler.importXML(xml);
    setCurrentXml(xml);
    fitDiagramToViewport();
    setStatus("Fresh BPMN template loaded.");
  };

  const downloadXml = async () => {
    const modeler = modelerRef.current;
    if (!modeler) return;
    const { xml } = await modeler.saveXML({ format: true });
    setCurrentXml(xml ?? "");
    const blob = new Blob([xml ?? ""], { type: "text/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeProcessKey}.bpmn`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("BPMN file downloaded.");
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const xml = await file.text();
    await importXml(xml, { recreate: true });
    setStatus(`Imported ${file.name}.`);
    event.target.value = "";
  };

  const saveBpmnToProcess = async () => {
    const modeler = modelerRef.current;
    const selected = catalogueProcesses.find((item) => String(item.id) === selectedProcessId);
    if (!modeler || !selected) return;

    setIsSavingBpmn(true);
    setStatus("Saving BPMN to the selected process...");

    try {
      const { xml } = await modeler.saveXML({ format: true });
      setCurrentXml(xml ?? "");
      await updateProcess({
        id: selected.id,
        data: {
          bpmn: xml ?? "",
        },
      });
      toast({ title: "BPMN saved", description: `Saved to ${selected.processName || selected.processDescription}` });
      setStatus(`Saved BPMN to ${selected.processName || selected.processDescription}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save BPMN";
      toast({ title: "Save failed", description: message, variant: "destructive" });
      setStatus(message);
    } finally {
      setIsSavingBpmn(false);
    }
  };

  const deployDiagram = async () => {
    const modeler = modelerRef.current;
    if (!modeler) return;

    setIsDeploying(true);
    setStatus("Deploying BPMN to Operaton...");

    try {
      const { xml } = await modeler.saveXML({ format: true });
      setCurrentXml(xml ?? "");
      const response = await fetch(`${API}/operaton/deploy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...fetchHeaders(),
        },
        body: JSON.stringify({
          deploymentName,
          fileName: `${safeProcessKey}.bpmn`,
          xml,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Deployment failed");
      }

      setWorkspaceReloadKey((value) => value + 1);
      setActiveTab("workspace");
      await refreshActiveInstances();
      setStatus(`Deployed ${deploymentName} to Operaton.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Deployment failed");
    } finally {
      setIsDeploying(false);
    }
  };

  const startProcess = async () => {
    const modeler = modelerRef.current;
    if (!modeler) return;

    setIsStartingProcess(true);
    setStatus(`Starting process ${safeProcessKey}...`);

    try {
      const { xml } = await modeler.saveXML({ format: true });
      setCurrentXml(xml ?? "");
      const response = await fetch(`${API}/operaton/processes/${encodeURIComponent(safeProcessKey)}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...fetchHeaders(),
        },
        body: JSON.stringify({
          deploymentName,
          fileName: `${safeProcessKey}.bpmn`,
          xml,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || payload?.details?.message || "Failed to start process");
      }

      await refreshActiveInstances();
      setWorkspaceReloadKey((value) => value + 1);
      toast({
        title: "Process started",
        description: payload?.autoDeployed
          ? `Deployed and started ${processName || safeProcessKey}.`
          : `Started a new instance of ${processName || safeProcessKey}.`,
      });
      setStatus(
        payload?.autoDeployed
          ? `Deployed and started ${safeProcessKey}.`
          : `Started a new instance of ${safeProcessKey}.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start process";
      toast({ title: "Start failed", description: message, variant: "destructive" });
      setStatus(message);
    } finally {
      setIsStartingProcess(false);
    }
  };

  const stopProcess = async () => {
    setIsStoppingProcess(true);
    setStatus(`Stopping the latest active instance of ${safeProcessKey}...`);

    try {
      const response = await fetch(`${API}/operaton/processes/${encodeURIComponent(safeProcessKey)}/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...fetchHeaders(),
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || payload?.details?.message || "Failed to stop process");
      }

      await refreshActiveInstances();
      setWorkspaceReloadKey((value) => value + 1);
      toast({
        title: "Process stopped",
        description: `Stopped the latest running instance of ${processName || safeProcessKey}.`,
      });
      setStatus(`Stopped the latest active instance of ${safeProcessKey}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to stop process";
      toast({ title: "Stop failed", description: message, variant: "destructive" });
      setStatus(message);
    } finally {
      setIsStoppingProcess(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-semibold">Operaton</div>
            <div className="text-xs text-muted-foreground">
              Design BPMN files and deploy them into the engine
            </div>
          </div>
        </div>
        <a
          href={operatonWorkspaceUrl()}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open workspace
        </a>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <TabsList>
            <TabsTrigger value="modeler">BPMN Modeler</TabsTrigger>
            <TabsTrigger value="workspace">Operaton Workspace</TabsTrigger>
          </TabsList>
          <div className="text-xs text-muted-foreground">{status}</div>
        </div>

        <TabsContent value="modeler" className="mt-0 flex min-h-0 flex-1">
          <div className="flex w-80 flex-shrink-0 flex-col gap-4 border-r border-border bg-sidebar/30 p-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Main System Process
              </label>
              <select
                value={selectedProcessId}
                onChange={(event) => { void loadProcessIntoModeler(event.target.value); }}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a process...</option>
                {catalogueProcessGroups.map(([category, groupedProcesses]) => (
                  <optgroup key={category} label={category}>
                    {groupedProcesses.map((process) => (
                      <option key={process.id} value={String(process.id)}>
                        {subprocessOptionLabel(process)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Process Name
              </label>
              <input
                value={processName}
                onChange={(event) => setProcessName(event.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder="Customer onboarding"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Process Key
              </label>
              <input
                value={processKey}
                onChange={(event) => setProcessKey(event.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder="customer_onboarding"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Deployment Name
              </label>
              <input
                value={deploymentName}
                onChange={(event) => setDeploymentName(event.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder="Customer onboarding v1"
              />
            </div>

            <div className="space-y-2">
              <button
                onClick={saveBpmnToProcess}
                disabled={!selectedProcessId || isBooting || isSavingBpmn}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingBpmn ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitBranch className="h-4 w-4" />}
                Save BPMN
              </button>

              <button
                onClick={resetDiagram}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary"
              >
                <WandSparkles className="h-4 w-4" />
                New Diagram
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary"
              >
                <FileUp className="h-4 w-4" />
                Import BPMN File
              </button>

              <button
                onClick={downloadXml}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary"
              >
                <Download className="h-4 w-4" />
                Download BPMN
              </button>
            </div>

            <div className="rounded-xl border border-border bg-background p-3">
              <div className="mb-2 text-sm font-medium">Deploy into Operaton</div>
              <p className="mb-3 text-xs leading-5 text-muted-foreground">
                This pushes the current BPMN XML into the local Operaton engine so you can start instances from the workspace.
              </p>
              <div className="mb-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                Active instances: <span className="font-medium text-foreground">{activeInstanceCount}</span>
              </div>
              <button
                onClick={deployDiagram}
                disabled={isBooting || isDeploying}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Deploy BPMN
              </button>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={startProcess}
                  disabled={isBooting || isDeploying || isStartingProcess}
                  className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isStartingProcess ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                  Start Process
                </button>
                <button
                  onClick={stopProcess}
                  disabled={isBooting || isDeploying || isStoppingProcess || activeInstanceCount === 0}
                  className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isStoppingProcess ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Stop Process
                </button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".bpmn,.xml,text/xml"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>

          <div className="relative min-h-0 flex-1">
            {isBooting && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/90">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading BPMN modeler...
                </div>
              </div>
            )}
            <div ref={canvasRef} className="h-full w-full bg-white" />
          </div>
        </TabsContent>

        <TabsContent value="workspace" className="mt-0 flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-3 text-xs text-muted-foreground">
            <span>Operaton Cockpit opens here so you can inspect and start deployed definitions.</span>
            <button
              onClick={() => {
                setWorkspaceState("idle");
                setWorkspaceReloadKey((value) => value + 1);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 font-medium transition-colors hover:bg-secondary hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reload workspace
            </button>
          </div>
          {workspaceState === "checking" || workspaceState === "idle" ? (
            <div className="flex h-full items-center justify-center bg-background">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking Operaton workspace...
              </div>
            </div>
          ) : workspaceState === "unavailable" ? (
            <div className="flex h-full items-center justify-center bg-background p-6">
              <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
                <div className="text-base font-semibold text-foreground">Operaton workspace is unavailable</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  The frontend could not reach the local Operaton service behind the `/operaton` proxy.
                  Start Operaton on `http://localhost:8080`, then reload this workspace.
                </p>
                <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-left text-xs text-muted-foreground">
                  {workspaceError}
                </div>
                <div className="mt-4 flex items-center justify-center gap-2">
                  <button
                    onClick={() => {
                      setWorkspaceState("idle");
                      setWorkspaceReloadKey((value) => value + 1);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Retry workspace
                  </button>
                  <a
                    href={operatonWorkspaceUrl()}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open anyway
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <iframe
              key={workspaceReloadKey}
              src={operatonWorkspaceUrl()}
              title="Operaton Workspace"
              className="h-full w-full border-0"
              allow="clipboard-read; clipboard-write"
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
