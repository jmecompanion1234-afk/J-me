// The brain behind the anticipator: one function that takes a chat and returns text.
// The Node engine uses Ollama; the browser extension plugs in Chrome's built-in model,
// WebLLM, or Ollama when it is running on the same machine.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  /** ask for a JSON object */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export type Chat = (messages: ChatMessage[], opts: ChatOptions) => Promise<string>;

/** A brain that talks to an Ollama server. */
export function ollamaChat(host: string, model: string): Chat {
  return async (messages, o) => {
    const body = {
      model,
      stream: false,
      ...(o.json ? { format: 'json' } : {}),
      options: { temperature: o.temperature ?? 0.3, num_predict: o.maxTokens ?? 600 },
      messages,
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 60_000);
    try {
      const res = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { message?: { content?: string } };
      return data.message?.content ?? '';
    } finally {
      clearTimeout(timer);
    }
  };
}
