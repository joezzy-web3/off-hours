// POST /api/ask {question, reply} : rewords an answer the page has already
// computed. The model is given the answer's own lines and may only rephrase
// them. If its text contains any number the answer did not, or no model is
// configured, the page keeps its own wording.
import type { ServerResponse } from 'node:http';
import { Reply, sameNumbers } from '../src/core/ask';
import { chat, modelName } from '../src/core/model';
import { Req, readJson, send } from './_http';

export default async function handler(req: Req, res: ServerResponse) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  try {
    const { question, reply } = await readJson<{ question?: string; reply?: Reply }>(req);
    if (!modelName() || !reply?.lines?.length || typeof question !== 'string') return send(res, 200, { text: null });
    const text = await chat(
      'You reword answers for a trading research tool. Use only the facts given. Do not add any number, name or claim that is not in the facts. Do not give advice. Two or three plain sentences.',
      `Question: ${question.slice(0, 300)}\nFacts:\n${reply.lines.join('\n').slice(0, 2000)}`,
    );
    send(res, 200, { text: text && sameNumbers(text, reply) ? text.trim().slice(0, 900) : null });
  } catch {
    send(res, 200, { text: null });
  }
}
