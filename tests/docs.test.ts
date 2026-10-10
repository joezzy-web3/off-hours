// The README quotes the study. This test fails if a figure in it is not the
// figure research/results.json holds, so the two cannot drift apart.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const r = JSON.parse(fs.readFileSync('research/results.json', 'utf8'));
const readme = fs.readFileSync('README.md', 'utf8');
const n = (x: number) => x.toLocaleString('en-US');
const bp = (x: number) => { const v = (x * 1e4).toFixed(1); return v === '-0.0' ? '0.0' : `${x > 0 ? '+' : ''}${v}`; };
const pc = (x: number) => `${(x * 100).toFixed(1)}%`;

test('The figures quoted in the README are the ones in research/results.json', () => {
  const c1 = r.claim1, c2 = r.claim2, c3 = r.claim3, since = r.posthoc.periods[1], br = r.posthoc.baseRate;
  const expected: Record<string, string> = {
    'moves and sessions': `${n(r.sets.test.events)} moves in ${n(r.sets.test.windows)} closed sessions`,
    'mean move after the call': `**${bp(c1.y.mean)} bp** | ${bp(c1.y.lo)} to ${bp(c1.y.hi)}`,
    'share that held': `**${pc(c1.held.mean)}** | ${pc(c1.held.lo)} to ${pc(c1.held.hi)}`,
    'share that went further': `**${pc(c1.extended.mean)}** | ${pc(c1.extended.lo)} to ${pc(c1.extended.hi)}`,
    'coverage of the 80% range': `**${pc(c2.coverage.mean)}** | ${pc(c2.coverage.lo)} to ${pc(c2.coverage.hi)}`,
    'points a call': `**${c2.points.mean.toFixed(2)} points** | ${c2.points.lo.toFixed(2)} to ${c2.points.hi.toFixed(2)}`,
    'order rule against half and half': `**${bp(c3.vsSplit.mean)} bp** | ${bp(c3.vsSplit.lo)} to ${bp(c3.vsSplit.hi)}`,
    'how often the order rule acted': `${c3.plans.now + c3.plans.bell} of ${n(c3.events)} moves`,
    'margin the data cannot rule out': `about ${Math.round(((c1.y.hi - c1.y.lo) / 2) * 1e4)} basis points either way`,
    'weekend moves since weekend trading began': `${bp(since.weekend.y.mean)} bp, interval ${bp(since.weekend.y.lo)} to ${bp(since.weekend.y.hi)}`,
    'range width against the plain range': `${pc(c2.width.mean)} against ${pc(c2.baselineWidth.mean)} of price`,
    'coverage against the plain range': `${pc(c2.coverage.mean)} against ${pc(c2.baselineCoverage.mean)}`,
    'calls matched by the second implementation': `all ${n(r.sets.all.events)} calls`,
    'entries in the ledger': `${n(r.ledger.entries)} entries`,
    'breakdowns': `all ${r.breakdownCount} breakdowns`,
    'resamples': `${n(r.resamples)} resamples`,
    'contracts': r.data.contracts.join(', ').replace(/, ([A-Z]+)$/, ' and $1'),
    'the house against the base rate': `**${br.difference.mean.toFixed(2)} points** | ${br.difference.lo.toFixed(2)} to +${br.difference.hi.toFixed(2)}`,
    'the house and always saying holds': `right ${pc(br.houseHit)} of the time`,
    'points of the house and of the base rate': `${c2.points.mean.toFixed(2)} points a call against ${br.runningPoints.mean.toFixed(2)} for a plain running base rate`,
    'the lowest forecast the house made': `never forecast below ${pc(br.lowestForecast)}`,
  };
  assert.equal(br.houseHit, br.alwaysHoldsHit, 'the README says the house is right exactly as often as always saying holds');
  for (const [what, text] of Object.entries(expected)) assert.ok(readme.includes(text), `README is out of step with the study on ${what}: expected to find "${text}"`);
});
