const MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const VECTOR_DIMENSIONS = 384;

type EncoderOutput = {
  data: ArrayLike<number>;
  dims: number[];
};

type FeatureExtractor = (
  input: string,
  options: { pooling: "mean"; normalize: true },
) => Promise<EncoderOutput>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

function assetUrl(relativePath: string): string {
  return new URL(relativePath, document.baseURI).href;
}

async function loadExtractor(onStatus?: (status: string) => void): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      onStatus?.("Loading the bundled understanding model…");
      const transformers = await import("@huggingface/transformers");
      transformers.env.allowLocalModels = true;
      transformers.env.allowRemoteModels = false;
      transformers.env.localModelPath = assetUrl("local-model/");
      const wasm = transformers.env.backends.onnx.wasm;
      if (!wasm) throw new Error("The local WebAssembly runtime is unavailable.");
      wasm.numThreads = 1;
      wasm.proxy = false;
      return await transformers.pipeline("feature-extraction", MODEL_ID, {
        device: "wasm",
        dtype: "q8",
      }) as unknown as FeatureExtractor;
    })().catch((error) => {
      extractorPromise = null;
      throw error;
    });
  }
  return await extractorPromise;
}

export async function encodePromptLocally(
  prompt: string,
  onStatus?: (status: string) => void,
): Promise<Float32Array> {
  const extractor = await loadExtractor(onStatus);
  onStatus?.("Understanding the complete request…");
  const output = await extractor(prompt.trim(), { pooling: "mean", normalize: true });
  if (
    output.dims[output.dims.length - 1] !== VECTOR_DIMENSIONS ||
    output.data.length !== VECTOR_DIMENSIONS
  ) {
    throw new Error("The local understanding model returned an unexpected result.");
  }
  return Float32Array.from(output.data);
}
