let _pipeline: any = null;
let _loading: Promise<any> | null = null;

export function hasPgVectorSupport(): boolean {
  return process.env.ENABLE_PGVECTOR === "true";
}

async function getPipeline(): Promise<any> {
  if (_pipeline) return _pipeline;
  if (_loading) return _loading;

  _loading = (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = "./.model-cache";
    env.allowRemoteModels = true;
    const p = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      dtype: "fp32",
    });
    _pipeline = p;
    return _pipeline;
  })();

  return _loading;
}

export async function embed(text: string): Promise<number[]> {
  const p = await getPipeline();
  const cleaned = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
  const output = await p(cleaned, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

export function vecToSql(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export function isReady(): boolean {
  return _pipeline !== null;
}

export async function warmUp(): Promise<void> {
  console.log("[embeddings] warming up all-MiniLM-L6-v2 model...");
  try {
    await embed("warmup");
    console.log("[embeddings] model ready");
  } catch (err) {
    console.error("[embeddings] warm-up failed:", err);
  }
}
