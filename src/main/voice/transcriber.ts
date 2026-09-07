/** Speech to text on this machine. Whisper runs inside the main process through transformers.js
 * and ONNX Runtime; the microphone audio never leaves the computer. The model (about 80 MB) is
 * fetched once from Hugging Face into the app's data folder and reused from then on, so the first
 * use needs the internet and every later one does not. */
import { app } from 'electron';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MODEL_ID = 'onnx-community/whisper-base.en';

export interface VoiceStatus {
  modelId: string;
  ready: boolean;
  downloaded: boolean;
  modelDir: string;
  error: string | null;
}

type Pipeline = (audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text: string }>;

let pipelinePromise: Promise<Pipeline> | null = null;
let lastError: string | null = null;

function modelRoot(): string {
  return path.join(app.getPath('userData'), 'models');
}

function modelDir(): string {
  return path.join(modelRoot(), ...MODEL_ID.split('/'));
}

function isDownloaded(): boolean {
  const dir = path.join(modelDir(), 'onnx');
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).some((name) => /decoder.*\.onnx$/.test(name)) && fs.readdirSync(dir).some((name) => /encoder.*\.onnx$/.test(name));
}

/** transformers.js is an ES module that loads its ONNX runtime by a path relative to its own
 * package folder. Bundling it would move that code and break the native binding, and the main
 * bundle is CommonJS, so a plain `import()` would be rewritten to `require()` and fail on an ES
 * module. Resolve the file from node_modules and import it through a function the bundler
 * cannot see, which leaves it exactly where it works. */
async function importTransformers(): Promise<typeof import('@huggingface/transformers')> {
  const require = createRequire(import.meta.url || pathToFileURL(__filename).href);
  const entry = require.resolve('@huggingface/transformers');
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<typeof import('@huggingface/transformers')>;
  return dynamicImport(pathToFileURL(entry).href);
}

async function loadPipeline(onProgress?: (message: string) => void): Promise<Pipeline> {
  const transformers = await importTransformers();
  transformers.env.cacheDir = modelRoot();
  transformers.env.allowLocalModels = true;
  const pipe = await transformers.pipeline('automatic-speech-recognition', MODEL_ID, {
    dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' },
    device: 'cpu',
    progress_callback: (p: { status?: string; file?: string; progress?: number }) => {
      if (onProgress && p.status === 'progress' && p.file) onProgress(`${p.file} ${Math.round(p.progress ?? 0)}%`);
    },
  } as never);
  return pipe as unknown as Pipeline;
}

/** Downloads (first time) and warms the model. Safe to call repeatedly. */
export async function prepareVoice(onProgress?: (message: string) => void): Promise<VoiceStatus> {
  if (!pipelinePromise) {
    pipelinePromise = loadPipeline(onProgress).catch((error) => {
      pipelinePromise = null;
      lastError = error instanceof Error ? error.message : String(error);
      throw error;
    });
  }
  await pipelinePromise;
  lastError = null;
  return voiceStatus();
}

export function voiceStatus(): VoiceStatus {
  return { modelId: MODEL_ID, ready: pipelinePromise !== null && lastError === null, downloaded: isDownloaded(), modelDir: modelDir(), error: lastError };
}

/** `audio` is mono PCM at 16 kHz, values in [-1, 1] — what the renderer's capture produces. */
export async function transcribe(audio: Float32Array): Promise<string> {
  if (audio.length < 1600) return '';
  const pipe = await (pipelinePromise ?? prepareVoice().then(() => pipelinePromise!));
  const result = await pipe(audio, { chunk_length_s: 30, return_timestamps: false });
  return (result.text ?? '').trim();
}
