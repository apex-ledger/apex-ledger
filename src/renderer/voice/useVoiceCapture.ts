import { useCallback, useEffect, useRef, useState } from 'react';

/** Microphone capture for the voice agent: opens the mic on start, gathers mono PCM, and hands
 * back 16 kHz samples on stop — the format Whisper expects — so the main process gets audio it
 * can transcribe without any decoding of its own. */
export type CaptureState = 'idle' | 'listening' | 'denied' | 'unsupported';

const TARGET_RATE = 16_000;

function downsample(input: Float32Array, fromRate: number): Float32Array {
  if (fromRate === TARGET_RATE) return input;
  const ratio = fromRate / TARGET_RATE;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

export function useVoiceCapture() {
  const [state, setState] = useState<CaptureState>('idle');
  const [level, setLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  const stopNodes = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setState('unsupported'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const context = new AudioContext();
      contextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      chunksRef.current = [];
      processor.onaudioprocess = (event) => {
        const data = event.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(data));
        let peak = 0;
        for (let i = 0; i < data.length; i += 16) peak = Math.max(peak, Math.abs(data[i]));
        setLevel(peak);
      };
      source.connect(processor);
      processor.connect(context.destination);
      setState('listening');
    } catch {
      setState('denied');
    }
  }, []);

  /** Stops the mic and returns everything heard since start, at 16 kHz. */
  const stop = useCallback((): Float32Array => {
    const rate = contextRef.current?.sampleRate ?? TARGET_RATE;
    const total = chunksRef.current.reduce((n, c) => n + c.length, 0);
    const joined = new Float32Array(total);
    let offset = 0;
    for (const c of chunksRef.current) { joined.set(c, offset); offset += c.length; }
    chunksRef.current = [];
    stopNodes();
    setState('idle');
    setLevel(0);
    return downsample(joined, rate);
  }, [stopNodes]);

  useEffect(() => () => stopNodes(), [stopNodes]);

  return { state, level, start, stop };
}
