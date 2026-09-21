import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const REVISION = "2c4055b12046f11709e9df2c122e59ffbdc2f900";
const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(desktopRoot, "public", "local-model");

const modelFiles = [
  { path: "config.json", size: 673, sha256: "05b570bff786faa5c4604152aa16f19f77ed6dfc31e47dd0f3dd987078693ac7" },
  { path: "tokenizer.json", size: 17_082_913, sha256: "b60b6b43406a48bf3638526314f3d232d97058bc93472ff2de930d43686fa441" },
  { path: "tokenizer_config.json", size: 496, sha256: "3f5961b9ac86288cccdb97f32fb848d6187c78e1603958c53f3ea1f296b7d8a2" },
  { path: "special_tokens_map.json", size: 280, sha256: "06e405a36dfe4b9604f484f6a1e619af1a7f7d09e34a8555eb0b77b66318067f" },
  { path: "onnx/model_quantized.onnx", size: 118_308_126, sha256: "66fc00f5f29afcaff34092e1bdd20008ca3918265a82fb9695a551e510cc4ebc" },
];

async function sha256(filePath) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

async function valid(filePath, expected) {
  try {
    const details = await stat(filePath);
    return details.size === expected.size && (await sha256(filePath)) === expected.sha256;
  } catch {
    return false;
  }
}

async function downloadFile(file) {
  const destination = path.join(publicRoot, MODEL_ID, file.path);
  await mkdir(path.dirname(destination), { recursive: true });
  const stalePrefix = `${path.basename(destination)}.download-`;
  const siblings = await readdir(path.dirname(destination));
  await Promise.all(
    siblings
      .filter((name) => name.startsWith(stalePrefix))
      .map((name) => rm(path.join(path.dirname(destination), name), { force: true })),
  );
  if (await valid(destination, file)) {
    console.log(`Verified ${file.path}`);
    return;
  }

  const temporary = `${destination}.download-${process.pid}`;
  const url = `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}/${file.path}`;
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status} while downloading ${file.path}`);
      }
      await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
      if (!(await valid(temporary, file))) {
        throw new Error(`Checksum or size mismatch for ${file.path}`);
      }
      await rm(destination, { force: true });
      await rename(temporary, destination);
      console.log(`Downloaded and verified ${file.path}`);
      return;
    } catch (error) {
      lastError = error;
      await rm(temporary, { force: true });
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
    }
  }
  throw lastError;
}

await Promise.all(modelFiles.map(downloadFile));

await writeFile(
  path.join(publicRoot, "NOTICE.txt"),
  [
    "Watchmaker bundled local semantic model",
    `Model: ${MODEL_ID}`,
    `Pinned revision: ${REVISION}`,
    "License: Apache-2.0",
    "The model runs on-device. Prompts are not transmitted.",
    "",
  ].join("\n"),
  "utf8",
);

console.log("The private local semantic model is ready.");
