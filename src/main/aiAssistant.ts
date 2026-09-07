import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export type AiProvider = 'claude' | 'chatgpt' | 'gemini' | 'qwen' | 'deepseek' | 'groq';

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AiKeys {
  anthropicApiKey: string | null;
  openaiApiKey: string | null;
  geminiApiKey: string | null;
  qwenApiKey: string | null;
  deepseekApiKey: string | null;
  groqApiKey: string | null;
  anthropicModel: string;
  openaiModel: string;
  geminiModel: string;
  qwenModel: string;
  deepseekModel: string;
  groqModel: string;
}

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';
const DEFAULT_OPENAI_MODEL = 'gpt-4o';
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';
const DEFAULT_QWEN_MODEL = 'qwen-plus';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

function keysFilePath(): string {
  return path.join(app.getPath('userData'), 'ai-keys.json');
}

function readKeys(): AiKeys {
  try {
    const raw = fs.readFileSync(keysFilePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      anthropicApiKey: parsed.anthropicApiKey ?? null,
      openaiApiKey: parsed.openaiApiKey ?? null,
      geminiApiKey: parsed.geminiApiKey ?? null,
      qwenApiKey: parsed.qwenApiKey ?? null,
      deepseekApiKey: parsed.deepseekApiKey ?? null,
      groqApiKey: parsed.groqApiKey ?? null,
      anthropicModel: parsed.anthropicModel || DEFAULT_ANTHROPIC_MODEL,
      openaiModel: parsed.openaiModel || DEFAULT_OPENAI_MODEL,
      geminiModel: parsed.geminiModel || DEFAULT_GEMINI_MODEL,
      qwenModel: parsed.qwenModel || DEFAULT_QWEN_MODEL,
      deepseekModel: parsed.deepseekModel || DEFAULT_DEEPSEEK_MODEL,
      groqModel: parsed.groqModel || DEFAULT_GROQ_MODEL,
    };
  } catch {
    return {
      anthropicApiKey: null,
      openaiApiKey: null,
      geminiApiKey: null,
      qwenApiKey: null,
      deepseekApiKey: null,
      groqApiKey: null,
      anthropicModel: DEFAULT_ANTHROPIC_MODEL,
      openaiModel: DEFAULT_OPENAI_MODEL,
      geminiModel: DEFAULT_GEMINI_MODEL,
      qwenModel: DEFAULT_QWEN_MODEL,
      deepseekModel: DEFAULT_DEEPSEEK_MODEL,
      groqModel: DEFAULT_GROQ_MODEL,
    };
  }
}

function writeKeys(keys: AiKeys): void {
  fs.mkdirSync(path.dirname(keysFilePath()), { recursive: true });
  fs.writeFileSync(keysFilePath(), JSON.stringify(keys, null, 2), 'utf-8');
}

export function getAiKeyStatus() {
  const keys = readKeys();
  return {
    anthropicConfigured: !!keys.anthropicApiKey,
    openaiConfigured: !!keys.openaiApiKey,
    geminiConfigured: !!keys.geminiApiKey,
    qwenConfigured: !!keys.qwenApiKey,
    deepseekConfigured: !!keys.deepseekApiKey,
    groqConfigured: !!keys.groqApiKey,
    anthropicModel: keys.anthropicModel,
    openaiModel: keys.openaiModel,
    geminiModel: keys.geminiModel,
    qwenModel: keys.qwenModel,
    deepseekModel: keys.deepseekModel,
    groqModel: keys.groqModel,
  };
}

export function saveAiKeys(patch: {
  anthropicApiKey?: string | null;
  openaiApiKey?: string | null;
  geminiApiKey?: string | null;
  qwenApiKey?: string | null;
  deepseekApiKey?: string | null;
  groqApiKey?: string | null;
  anthropicModel?: string;
  openaiModel?: string;
  geminiModel?: string;
  qwenModel?: string;
  deepseekModel?: string;
  groqModel?: string;
}) {
  const current = readKeys();
  writeKeys({ ...current, ...patch });
  return getAiKeyStatus();
}

/** Sends the whole conversation so far (each API is stateless per-call) and returns just the new
 * assistant reply text. Each provider's request/response shape is different enough — Anthropic's
 * `content` blocks, OpenAI's `choices[0].message`, Google's `contents`/`parts` with "model"
 * instead of "assistant" as the role name — that they're kept as separate branches rather than
 * forced into one shared shape. */
export async function sendChatMessage(provider: AiProvider, messages: AiChatMessage[]): Promise<string> {
  const keys = readKeys();

  if (provider === 'claude') {
    if (!keys.anthropicApiKey) throw new Error('No Claude API key saved yet — add one in Settings → AI Assistant.');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': keys.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: keys.anthropicModel, max_tokens: 1024, messages }),
    });
    if (!res.ok) throw new Error(`Claude API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data: { content?: { type: string; text?: string }[] } = await res.json();
    const textBlock = data.content?.find((b) => b.type === 'text');
    return textBlock?.text ?? '(no response text)';
  }

  if (provider === 'gemini') {
    if (!keys.geminiApiKey) throw new Error('No Gemini API key saved yet — add one in Settings → AI Assistant.');
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${keys.geminiModel}:generateContent?key=${keys.geminiApiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      }),
    });
    if (!res.ok) throw new Error(`Gemini API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data: { candidates?: { content?: { parts?: { text?: string }[] } }[] } = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '(no response text)';
  }

  if (provider === 'qwen') {
    if (!keys.qwenApiKey) throw new Error('No Qwen API key saved yet — add one in Settings → AI Assistant.');
    // Alibaba Cloud's DashScope exposes Qwen through an OpenAI-compatible endpoint — same
    // Bearer-auth + {model, messages} request shape and {choices[0].message.content} response as
    // the ChatGPT branch below, just a different host.
    const res = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${keys.qwenApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: keys.qwenModel, messages }),
    });
    if (!res.ok) throw new Error(`Qwen API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data: { choices?: { message?: { content?: string } }[] } = await res.json();
    return data.choices?.[0]?.message?.content ?? '(no response text)';
  }

  if (provider === 'deepseek') {
    if (!keys.deepseekApiKey) throw new Error('No DeepSeek API key saved yet — add one in Settings → AI Assistant.');
    // DeepSeek's own API is OpenAI-compatible too — same Bearer-auth + {model, messages} request
    // and {choices[0].message.content} response as ChatGPT/Qwen above, just a different host.
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${keys.deepseekApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: keys.deepseekModel, messages }),
    });
    if (!res.ok) throw new Error(`DeepSeek API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data: { choices?: { message?: { content?: string } }[] } = await res.json();
    return data.choices?.[0]?.message?.content ?? '(no response text)';
  }

  if (provider === 'groq') {
    if (!keys.groqApiKey) throw new Error('No Groq API key saved yet — add one in Settings → AI Assistant.');
    // Groq runs open-source models (Llama, Mixtral, Qwen, DeepSeek-distill) on its own hardware
    // behind an OpenAI-compatible endpoint — same shape as ChatGPT/Qwen/DeepSeek above.
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${keys.groqApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: keys.groqModel, messages }),
    });
    if (!res.ok) throw new Error(`Groq API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data: { choices?: { message?: { content?: string } }[] } = await res.json();
    return data.choices?.[0]?.message?.content ?? '(no response text)';
  }

  if (!keys.openaiApiKey) throw new Error('No ChatGPT API key saved yet — add one in Settings → AI Assistant.');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${keys.openaiApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: keys.openaiModel, messages }),
  });
  if (!res.ok) throw new Error(`ChatGPT API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data: { choices?: { message?: { content?: string } }[] } = await res.json();
  return data.choices?.[0]?.message?.content ?? '(no response text)';
}
