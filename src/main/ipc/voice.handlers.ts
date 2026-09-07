import type { BrowserWindow } from 'electron';
import { prepareVoice, transcribe, voiceStatus } from '../voice/transcriber';

export function voiceStatusHandler() {
  return voiceStatus();
}

/** Downloads the model on first use; progress lines go to the window so the settings card can show them. */
export async function voicePrepareHandler(window: BrowserWindow | null) {
  return prepareVoice((message) => {
    if (window && !window.isDestroyed()) window.webContents.send('voice:progress', message);
  });
}

/** `input` is the PCM the renderer captured: a Float32Array at 16 kHz, or a plain array of numbers
 * when the structured clone lost the typed array on the way over. */
export async function voiceTranscribeHandler(input: unknown) {
  const raw = input as { samples: Float32Array | number[] | ArrayBuffer };
  const samples = raw.samples instanceof Float32Array ? raw.samples : raw.samples instanceof ArrayBuffer ? new Float32Array(raw.samples) : Float32Array.from(raw.samples as number[]);
  const text = await transcribe(samples);
  return { text };
}
