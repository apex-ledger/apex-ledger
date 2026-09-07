import { useEffect, useRef, useState } from 'react';
import type { AiChatMessage, AiKeyStatus, AiProvider } from '../../preload/index';
import { useUiStore } from '../app/store/uiStore';

const PROVIDER_LABEL: Record<AiProvider, string> = {
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  qwen: 'Qwen',
  deepseek: 'DeepSeek',
  groq: 'Groq',
};
const PROVIDER_WEBSITE: Record<AiProvider, string> = {
  claude: 'https://claude.ai',
  chatgpt: 'https://chatgpt.com',
  gemini: 'https://gemini.google.com',
  qwen: 'https://chat.qwen.ai',
  deepseek: 'https://chat.deepseek.com',
  groq: 'https://groq.com/chat',
};
const PROVIDER_DOMAIN_LABEL: Record<AiProvider, string> = {
  claude: 'Claude.ai',
  chatgpt: 'ChatGPT.com',
  gemini: 'Gemini.google.com',
  qwen: 'Chat.Qwen.ai',
  deepseek: 'Chat.DeepSeek.com',
  groq: 'Groq.com',
};
// Only Groq's own API key is genuinely free with no trial/expiry — Gemini and Qwen have limited
// free trials that vary by account type (see the Settings page copy for details), so they're not
// badged here to avoid promising something that turned out not to hold for every account.
const PROVIDER_FREE_API: Partial<Record<AiProvider, boolean>> = { groq: true };

/** A right-side drawer (like the Claude-in-Excel / Claude-in-Chrome side panel) rather than a
 * centered dialog — it sits alongside whatever page is open instead of blocking it. */
export function AiChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [provider, setProvider] = useState<AiProvider>('claude');
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyStatus, setKeyStatus] = useState<AiKeyStatus | null>(null);
  const setView = useUiStore((s) => s.setView);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    window.api.aiAssistant.keysStatus().then((r) => r.ok && setKeyStatus(r.data));
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  if (!open) return null;

  const isConfigured = keyStatus
    ? ({
        claude: keyStatus.anthropicConfigured,
        chatgpt: keyStatus.openaiConfigured,
        gemini: keyStatus.geminiConfigured,
        qwen: keyStatus.qwenConfigured,
        deepseek: keyStatus.deepseekConfigured,
        groq: keyStatus.groqConfigured,
      } satisfies Record<AiProvider, boolean>)[provider]
    : undefined;

  async function handleSend() {
    if (!input.trim() || busy) return;
    const nextMessages: AiChatMessage[] = [...messages, { role: 'user', content: input.trim() }];
    setMessages(nextMessages);
    setInput('');
    setBusy(true);
    setError(null);
    const result = await window.api.aiAssistant.chatSend({ provider, messages: nextMessages });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setMessages([...nextMessages, { role: 'assistant', content: result.data.reply }]);
  }

  return (
    <div className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
          <div className="flex flex-wrap items-center gap-1 rounded-full bg-gray-100 p-1">
            {(['claude', 'chatgpt', 'gemini', 'qwen', 'deepseek', 'groq'] as AiProvider[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${
                  provider === p ? 'bg-white text-brand-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {PROVIDER_LABEL[p]}
                {PROVIDER_FREE_API[p] && <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold text-green-700">FREE</span>}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
          <a href={PROVIDER_WEBSITE[provider]} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-600 hover:underline">
            Open {PROVIDER_DOMAIN_LABEL[provider]} in browser ↗
          </a>
          <p className="text-[11px] text-gray-400">Not connected to your company data.</p>
        </div>

        {keyStatus && !isConfigured && (
          <div className="mx-4 mt-3 flex items-center justify-between rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <span>No {PROVIDER_LABEL[provider]} API key saved yet.</span>
            <button
              type="button"
              onClick={() => {
                onClose();
                setView({ kind: 'companySettings' });
              }}
              className="font-medium underline"
            >
              Add one
            </button>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
          {messages.length === 0 && <p className="text-sm text-gray-400">Ask anything to get started.</p>}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                m.role === 'user' ? 'ml-auto bg-brand-600 text-white' : 'mr-auto border border-gray-200 bg-gray-50 text-gray-800'
              }`}
            >
              {m.content}
            </div>
          ))}
          {busy && <p className="text-xs text-gray-400">Thinking…</p>}
        </div>

        {error && <p className="px-4 text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 border-t border-gray-200 p-3">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message… (Enter to send, Shift+Enter for a new line)"
            className="flex-1 resize-none rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <button
            type="button"
            disabled={busy || !input.trim()}
            onClick={handleSend}
            className="rounded-full bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
    </div>
  );
}
