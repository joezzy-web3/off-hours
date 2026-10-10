// The clock. GitHub's own scheduler can start a job late or not at all, so the host
// starts the two workflows a few minutes after every hour (see the schedule in
// netlify.toml). GitHub's schedule stays in place as a second trigger; a run that
// finds nothing new commits nothing.
//
// Needs one setting on the host: GITHUB_DISPATCH_TOKEN, a fine-grained GitHub token for
// this repository with "Actions: read and write". Without it this function does nothing.

import { REPO } from '../src/ui/config';

/** The order matters: the order-book snapshot is recorded first so the agent publishes it. */
export const WORKFLOWS = ['record-book.yml', 'agent.yml'];

export async function handler(): Promise<{ statusCode: number; body: string }> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return { statusCode: 200, body: 'no token set: nothing started' };
  const base = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
  const out: string[] = [];
  for (const workflow of WORKFLOWS) {
    try {
      const res = await fetch(`${base}/repos/${REPO}/actions/workflows/${workflow}/dispatches`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'bellwether-clock', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main' }),
        signal: AbortSignal.timeout(10_000),
      });
      out.push(`${workflow}: ${res.status === 204 ? 'started' : `refused (${res.status})`}`);
    } catch (e) {
      out.push(`${workflow}: not reached (${(e as Error).name})`);
    }
  }
  console.log(out.join('; '));
  return { statusCode: 200, body: out.join('; ') };
}
