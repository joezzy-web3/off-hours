// The language-model player. It sees what a person sees on a board and answers
// with a probability. It never touches a price or a grade: code checks its
// answer, code scores it, and without a model configured it simply sits out.

import { OpenBoard } from './board';
import { HOUR } from './calendar';

export interface Answer { p: number; reason: string }

export function prompt(b: OpenBoard, now: number): { system: string; user: string } {
  const path = b.path.filter((v): v is number => v !== null).map((v) => v.toFixed(2)).join(', ');
  return {
    system: 'You are a player in a forecasting game about Bitget stock perpetuals. You are scored with a proper scoring rule: 100 x (0.25 - (p - outcome)^2), so say what you really believe. Answer with one line of JSON and nothing else: {"p": <whole number 0 to 100>, "reason": "<one sentence, at most 25 words>"}.',
    user: [
      `Contract: ${b.ticker} (${b.name}) USDT perpetual on Bitget.`,
      `The New York cash market closed ${Math.round((now - b.close) / HOUR)} hours ago and opens in ${Math.max(0, (b.bell - now) / HOUR).toFixed(1)} hours. This closed stretch is ${b.kind === 'weekend' ? 'a weekend or holiday' : 'one night'}.`,
      `Price at the close: ${b.c0}. The perp then moved ${(b.m * 100).toFixed(2)}% to ${b.price}, which is ${(Math.abs(b.m) / b.s).toFixed(2)} times its normal one-day move.`,
      `Hourly prices since the close: ${path}.`,
      'Question: what is the probability, in percent, that at least half of that move is still standing 90 minutes after the opening bell?',
    ].join('\n'),
  };
}

/** Accepts only a probability from 0 to 100; anything else is no answer. */
export function parseAnswer(text: string | null): Answer | null {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*?\}/);
  if (!m) return null;
  let raw: { p?: unknown; reason?: unknown };
  try { raw = JSON.parse(m[0]); } catch { return null; }
  const p = typeof raw.p === 'string' ? Number(raw.p) : raw.p;
  if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 100) return null;
  const reason = typeof raw.reason === 'string' ? raw.reason.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  return { p: Math.round(p) / 100, reason };
}

export type Chat = (system: string, user: string) => Promise<string | null>;

/**
 * The player's public label, or null when no model is configured. The label is
 * LLM_LABEL, never the model's own identifier: a host that scans the repository
 * for its secret values would otherwise find one in the published record.
 */
export const modelName = (env: NodeJS.ProcessEnv = process.env) => (env.LLM_BASE_URL && env.LLM_API_KEY && env.LLM_MODEL ? env.LLM_LABEL || 'language model' : null);

/** Why the last call to the model gave no text: a status code or a finish reason, never a secret. */
export let lastChatNote = '';

/**
 * One call to any OpenAI-compatible chat endpoint. Null when no model is configured.
 * The token limit is generous on purpose: some models spend output tokens on hidden
 * reasoning before they write, and a tight limit leaves them with no room to answer.
 */
export const chat: Chat = async (system, user) => {
  const { LLM_BASE_URL: base, LLM_API_KEY: key, LLM_MODEL: model } = process.env;
  if (!base || !key || !model) return null;
  const r = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature: 0.2, max_tokens: 4096, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) { lastChatNote = `the endpoint answered ${r.status}`; return null; }
  const json = (await r.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
  const text = json.choices?.[0]?.message?.content ?? null;
  lastChatNote = text ? '' : `no text in the answer (finish reason: ${json.choices?.[0]?.finish_reason ?? 'none given'})`;
  return text;
};

/** Ask once, and once more if the first answer cannot be read. */
export async function ask(b: OpenBoard, now: number, via: Chat = chat): Promise<Answer | null> {
  const { system, user } = prompt(b, now);
  for (let i = 0; i < 2; i++) {
    try {
      const text = await via(system, user);
      const a = parseAnswer(text);
      if (a) return a;
      if (text) lastChatNote = 'the answer was not the one line of JSON asked for';
    } catch (e) { lastChatNote = `the call failed (${(e as Error).name})`; /* try again, then sit out */ }
  }
  return null;
}
