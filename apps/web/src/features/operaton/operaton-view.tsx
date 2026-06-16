import { useEffect, useMemo, useRef, useState } from "react";
import BpmnModeler from "bpmn-js/lib/Modeler";
import {
  Download,
  FileUp,
  GitBranch,
  Loader2,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useAuth } from "@/app/providers/AuthContext";
import { useProcessesData, useOptimisticUpdateProcess } from "@/shared/hooks/use-app-data";
import { useToast } from "@/shared/hooks/use-toast";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";

const API = "/api";

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
  const docUploadRef = useRef<HTMLInputElement | null>(null);
  const [isGeneratingFromDoc, setIsGeneratingFromDoc] = useState(false);
  const modelerRef = useRef<BpmnModeler | null>(null);
  const [processName, setProcessName] = useState("");
  const [processKey, setProcessKey] = useState("");
  const [isBooting, setIsBooting] = useState(true);
  const [status, setStatus] = useState<string>("Starting BPMN modeler...");
  const [selectedProcessId, setSelectedProcessId] = useState<string>("");
  const [isSavingBpmn, setIsSavingBpmn] = useState(false);
  const [isGeneratingBpmn, setIsGeneratingBpmn] = useState(false);
  const safeProcessKey = slugify(processKey) || "business_os_process";
  const initialProcessId = useMemo(
    () => new URLSearchParams(window.location.search).get("processId") ?? "",
    [],
  );
  const catalogueProcesses = useMemo(
    () =>
      [...processes]
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
        setStatus("Design a BPMN process, then deploy it to the process engine.");
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

  const loadProcessIntoModeler = async (processId: string) => {
    if (!processId) return;
    setSelectedProcessId(processId);
    const selected = catalogueProcesses.find((item) => String(item.id) === processId);
    if (!selected) return;

    const nextName = selected.processName || selected.processDescription || "Business OS Process";
    const nextKey = slugify(selected.processName || selected.processDescription || `process_${selected.number}`) || "business_os_process";
    setProcessName(nextName);
    setProcessKey(nextKey);
    setStatus(`Fetching BPMN for ${nextName}…`);

    try {
      const response = await fetch(`${API}/processes/${encodeURIComponent(processId)}`, {
        headers: fetchHeaders(),
      });
      if (response.ok) {
        const data = await response.json() as { bpmn?: string };
        if (data.bpmn) {
          let xml = data.bpmn.trim();
          // If bpmn field holds a URL/link, fetch the actual BPMN XML from it
          if (xml.startsWith("http://") || xml.startsWith("https://")) {
            const bpmnRes = await fetch(xml);
            if (!bpmnRes.ok) throw new Error(`Could not fetch BPMN from ${xml}`);
            xml = await bpmnRes.text();
          } else if (xml.startsWith("/")) {
            // Relative path on the same server — include auth headers
            const bpmnRes = await fetch(xml, { headers: fetchHeaders() });
            if (!bpmnRes.ok) throw new Error(`Could not fetch BPMN from ${xml}`);
            xml = await bpmnRes.text();
          }
          await importXml(xml, { recreate: true });
          setStatus(`Loaded BPMN for ${nextName}.`);
          return;
        }
      }
    } catch {
      // fall through to fresh template
    }

    await importXml(createTemplateXml(nextName, nextKey), { recreate: true });
    setStatus(`No BPMN saved for ${nextName}. Starting fresh diagram.`);
  };

  useEffect(() => {
    if (!initialProcessId || selectedProcessId || catalogueProcesses.length === 0) return;
    void loadProcessIntoModeler(initialProcessId);
  }, [catalogueProcesses, initialProcessId, selectedProcessId]);

  useEffect(() => {
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
  }, [currentXml, starterXml]);

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

  const handleDocUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setIsGeneratingFromDoc(true);
    setStatus(`Generating BPMN from ${file.name}…`);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (selectedProcessId) formData.append("processId", selectedProcessId);
      const res = await fetch("/api/operaton/bpmn-from-doc", {
        method: "POST",
        headers: fetchHeaders(),
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate BPMN from document");
      }
      const { bpmn } = await res.json();
      await importXml(bpmn, { recreate: true });
      setStatus(`BPMN generated from ${file.name}.`);
      toast({ title: "BPMN created", description: `Diagram generated from ${file.name}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate BPMN";
      setStatus(`Error: ${message}`);
      toast({ title: "Generation failed", description: message, variant: "destructive" });
    } finally {
      setIsGeneratingFromDoc(false);
    }
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

  const generateBpmnWithAi = async () => {
    if (!selectedProcessId) return;
    setIsGeneratingBpmn(true);
    setStatus("Generating BPMN diagram with AI…");
    try {
      const response = await fetch(
        `${API}/processes/${encodeURIComponent(selectedProcessId)}/ai-generate-bpmn?save=true`,
        { method: "POST", headers: { "Content-Type": "application/json", ...fetchHeaders() } },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "AI generation failed");
      await importXml(payload.bpmn, { recreate: true });
      const selected = catalogueProcesses.find((item) => String(item.id) === selectedProcessId);
      toast({ title: "BPMN generated", description: `AI created a diagram for ${selected?.processName || selected?.processDescription || "this process"} and saved it.` });
      setStatus("AI-generated BPMN loaded.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate BPMN";
      toast({ title: "Generation failed", description: message, variant: "destructive" });
      setStatus(message);
    } finally {
      setIsGeneratingBpmn(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-semibold">Process Flows</div>
            <div className="text-xs text-muted-foreground">
              Design BPMN diagrams
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-end border-b border-border px-5 py-3">
          <div className="text-xs text-muted-foreground">{status}</div>
        </div>

        <div className="mt-0 flex min-h-0 flex-1">
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

            <div className="space-y-2">
              <button
                onClick={generateBpmnWithAi}
                disabled={!selectedProcessId || isBooting || isGeneratingBpmn}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGeneratingBpmn ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate BPMN with AI
              </button>

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
                onClick={() => docUploadRef.current?.click()}
                disabled={isGeneratingFromDoc}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGeneratingFromDoc ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="h-4 w-4" />
                )}
                Create BPMN from Doc Upload
              </button>

              <button
                onClick={downloadXml}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary"
              >
                <Download className="h-4 w-4" />
                Download BPMN
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".bpmn,.xml,text/xml"
              className="hidden"
              onChange={handleImportFile}
            />
            <input
              ref={docUploadRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              className="hidden"
              onChange={handleDocUpload}
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
        </div>
      </div>
    </div>
  );
}
