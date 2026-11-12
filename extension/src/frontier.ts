// A frontier model answering inside J-me, with the user's own key. Only the question and the
// moment that raised it leave the machine, and only when the user presses the button. The key
// lives in chrome.storage.local on this machine and is sent to nobody but the provider.
export interface FrontierSettings {
  provider: 'openai' | 'anthropic' | 'custom';
  key: string;
  model: string;
  /** custom: an OpenAI-compatible base URL, e.g. http://127.0.0.1:11434/v1 (Ollama, LM Studio) */
  baseUrl?: string;
}

export const FRONTIER_DEFAULTS: Record<FrontierSettings['provider'], { model: string; baseUrl: string }> = {
  openai: { model: 'gpt-4.1-mini', baseUrl: 'https://api.openai.com/v1' },
  anthropic: { model: 'claude-sonnet-5-5', baseUrl: 'https://api.anthropic.com' },
  custom: { model: 'qwen2.5:7b', baseUrl: 'http://127.0.0.1:11434/v1' },
};

const SYSTEM =
  'You are helping someone follow a live conversation. Answer the question directly, in plain prose, ' +
  'six sentences at most. Say what is established and what is contested. No preamble.';

export async function frontierAnswer(s: FrontierSettings, question: string, moment: string, timeoutMs = 45_000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const user = moment ? `${question}\n\nThe moment in the conversation that raised it: "${moment}"` : question;
  const base = (s.baseUrl || FRONTIER_DEFAULTS[s.provider].baseUrl).replace(/\/+$/, '');
  const model = s.model || FRONTIER_DEFAULTS[s.provider].model;
  try {
    if (s.provider === 'anthropic') {
      const res = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': s.key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model, max_tokens: 400, system: SYSTEM, messages: [{ role: 'user', content: user }] }),
      });
      if (!res.ok) throw new Error(`${s.provider} ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      return (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim();
    }
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', ...(s.key ? { authorization: `Bearer ${s.key}` } : {}) },
      body: JSON.stringify({ model, max_tokens: 400, temperature: 0.2, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }),
    });
    if (!res.ok) throw new Error(`${s.provider} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return (data.choices?.[0]?.message?.content ?? '').trim();
  } finally {
    clearTimeout(timer);
  }
}
