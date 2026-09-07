import { z } from 'zod';
import { getAiKeyStatus, saveAiKeys, sendChatMessage, type AiChatMessage, type AiProvider } from '../aiAssistant';

const saveKeysSchema = z.object({
  anthropicApiKey: z.string().trim().min(1).nullable().optional(),
  openaiApiKey: z.string().trim().min(1).nullable().optional(),
  geminiApiKey: z.string().trim().min(1).nullable().optional(),
  qwenApiKey: z.string().trim().min(1).nullable().optional(),
  deepseekApiKey: z.string().trim().min(1).nullable().optional(),
  groqApiKey: z.string().trim().min(1).nullable().optional(),
  anthropicModel: z.string().trim().min(1).optional(),
  openaiModel: z.string().trim().min(1).optional(),
  geminiModel: z.string().trim().min(1).optional(),
  qwenModel: z.string().trim().min(1).optional(),
  deepseekModel: z.string().trim().min(1).optional(),
  groqModel: z.string().trim().min(1).optional(),
});

const sendMessageSchema = z.object({
  provider: z.enum(['claude', 'chatgpt', 'gemini', 'qwen', 'deepseek', 'groq']),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1) })).min(1),
});

export function aiKeysStatus() {
  return getAiKeyStatus();
}

export function aiKeysSave(input: unknown) {
  const payload = saveKeysSchema.parse(input);
  return saveAiKeys(payload);
}

export async function aiChatSend(input: unknown) {
  const { provider, messages } = sendMessageSchema.parse(input);
  const reply = await sendChatMessage(provider as AiProvider, messages as AiChatMessage[]);
  return { reply };
}
