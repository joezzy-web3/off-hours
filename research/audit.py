"""A second, separate implementation of the study's arithmetic.

It shares no code with the TypeScript engine: its own calendar (Python's time-zone
database for New York hours), its own windows, scale, events, forecaster and
outcomes. It reads the same recorded candles, recomputes every test-set event from
scratch, and compares with research/results.json and research/events.csv.

    python3 research/audit.py        writes research/AUDIT.md, exits 1 on any mismatch
"""
import csv, json, math, os, random, sys
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")
H = 3_600_000
HOLIDAYS = {date.fromisoformat(d) for d in (
    "2025-09-01 2025-11-27 2025-12-25 2026-01-01 2026-01-19 2026-02-16 2026-04-03 2026-05-25 "
    "2026-06-19 2026-07-03 2026-09-07 2026-11-26 2026-12-25").split()}
EARLY = {date.fromisoformat(d) for d in "2025-11-28 2025-12-24 2026-11-27 2026-12-24".split()}
STOCKS = "NVDA TSLA AAPL MSFT META AMZN GOOGL MSTR COIN PLTR QQQ SPY".split()
TEST_END_DAY = date(2026, 8, 28)
THRESHOLD, MIN_PRIOR = 0.5, 30


def ms(d: date, hh: int, mm: int) -> int:
    return int(datetime.combine(d, time(hh, mm), NY).astimezone(timezone.utc).timestamp() * 1000)


def trading(d: date) -> bool:
    return d.weekday() < 5 and d not in HOLIDAYS


def load(folder):
    out = {}
    for tk in STOCKS:
        p = os.path.join(folder, f"{tk}USDT.csv")
        if not os.path.exists(p):
            continue
        with open(p) as f:
            out[tk] = {int(r[0]): float(r[4]) for r in csv.reader(f) if r}
    return out


def close_at(bars, end):  # close of the hourly bar that ends at `end`
    return bars.get(end - H)


def quantile(xs, p):
    s = sorted(xs)
    pos = (len(s) - 1) * p
    lo, hi = math.floor(pos), math.ceil(pos)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def main():
    market = load(os.path.join(os.environ.get("DATA_DIR", "data"), "hourly"))
    first = min(min(b) for b in market.values())
    last = max(max(b) for b in market.values()) + H
    d = datetime.fromtimestamp(first / 1000, timezone.utc).date() - timedelta(days=1)
    end = datetime.fromtimestamp(last / 1000, timezone.utc).date()
    days = []
    while d <= end:
        if trading(d):
            days.append(d)
        d += timedelta(days=1)

    # closes by trading day, for the scale
    cash_close = {dd: ms(dd, 13 if dd in EARLY else 16, 0) for dd in days}
    events, quiet, prior = [], [], []
    for i in range(len(days) - 1):
        D, N = days[i], days[i + 1]
        if D in EARLY or N in EARLY:
            continue
        close, bell = cash_close[D], ms(N, 9, 30)
        grade = bell + 90 * 60_000
        if close < first or grade > last:
            continue
        kind = "overnight" if (N - D).days == 1 else "weekend"
        decisions = list(range(close + H, bell - 90 * 60_000 + 1, H))
        made = []
        for tk, bars in market.items():
            # scale: sd of the last 20 close-to-close returns ending at D
            past = [close_at(bars, cash_close[x]) for x in days[max(0, i - 40): i + 1] if (D - x).days <= 45]
            rets = [b / a - 1 for a, b in zip(past, past[1:]) if a is not None and b is not None][-20:]
            c0 = close_at(bars, close)
            if len(rets) < 10 or c0 is None:
                continue
            mean = sum(rets) / len(rets)
            s = math.sqrt(sum((r - mean) ** 2 for r in rets) / (len(rets) - 1))
            hit = None
            for t in decisions:
                p = close_at(bars, t)
                if p is not None and abs(p / c0 - 1) >= THRESHOLD * s:
                    hit = (t, p)
                    break
            out = close_at(bars, grade)
            if hit is None:
                p = close_at(bars, decisions[-1])
                if p is not None and out is not None:
                    m = p / c0 - 1
                    quiet.append(dict(window=D.isoformat(), y=(1 if m > 0 else -1 if m < 0 else 0) * (out / p - 1), test=N <= TEST_END_DAY))
                continue
            t, p = hit
            m = p / c0 - 1
            made.append(dict(id=f"{D.isoformat()}:{tk}USDT", window=D.isoformat(), tk=tk, kind=kind, at=t, c0=c0, s=s, m=m, price=p,
                             size="small" if abs(m) < s else "large", out=out, test=N <= TEST_END_DAY))
        # calls are made in time order, then contract order; each forecast sees only earlier windows
        order = {tk: n for n, tk in enumerate(market)}
        made.sort(key=lambda e: (e["at"], order[e["tk"]]))
        for e in made:
            pool = [q for q in prior if q["kind"] == e["kind"] and q["size"] == e["size"]]
            if len(pool) < MIN_PRIOR:
                pool = prior
            e["fc"] = None
            if len(pool) >= MIN_PRIOR:
                v = [q["y"] / q["s"] for q in pool]
                sg = 1 if e["m"] > 0 else -1
                a, b = e["price"] * (1 + sg * quantile(v, 0.1) * e["s"]), e["price"] * (1 + sg * quantile(v, 0.9) * e["s"])
                qq = sum(1 for q in pool if q["y"] > 0) / len(pool)
                e["fc"] = dict(p=sum(1 for q in pool if q["held"]) / len(pool), lo=min(a, b), hi=max(a, b), plan=1 if qq >= 0.6 else 0 if qq <= 0.4 else 0.5)
        for e in made:  # the bell rings: grade, and only now let later windows learn from them
            if e["out"] is None:
                continue
            sg = 1 if e["m"] > 0 else -1
            e["y"] = sg * (e["out"] / e["price"] - 1)
            e["retained"] = (e["out"] / e["c0"] - 1) / e["m"]
            e["held"] = e["retained"] >= 0.5
            events.append(e)
            prior.append(e)

    test = [e for e in events if e["test"]]
    fc = [e for e in test if e["fc"]]
    mine = {
        "test events": len(test),
        "test windows": len({e["window"] for e in test}),
        "quiet contract-windows": sum(1 for q in quiet if q["test"]),
        "mean Y": sum(e["y"] for e in test) / len(test),
        "share that went further": sum(1 for e in test if e["y"] > 0) / len(test),
        "share that held": sum(1 for e in test if e["held"]) / len(test),
        "mean Y, quiet windows": sum(q["y"] for q in quiet if q["test"]) / sum(1 for q in quiet if q["test"]),
        "events with a forecast": len(fc),
        "share inside the 80% range": sum(1 for e in fc if e["fc"]["lo"] <= e["out"] <= e["fc"]["hi"]) / len(fc),
        "mean points": sum(100 * (0.25 - (e["fc"]["p"] - (1 if e["held"] else 0)) ** 2) for e in fc) / len(fc),
        "mean timing gain": sum((e["fc"]["plan"] - 0.5) * e["y"] for e in fc) / len(fc),
    }
    r = json.load(open("research/results.json"))
    theirs = {
        "test events": r["sets"]["test"]["events"], "test windows": r["sets"]["test"]["windows"], "quiet contract-windows": r["sets"]["test"]["quiet"],
        "mean Y": r["claim1"]["y"]["mean"], "share that went further": r["claim1"]["extended"]["mean"], "share that held": r["claim1"]["held"]["mean"],
        "mean Y, quiet windows": r["claim1"]["quiet"]["mean"], "events with a forecast": r["claim2"]["events"],
        "share inside the 80% range": r["claim2"]["coverage"]["mean"], "mean points": r["claim2"]["points"]["mean"], "mean timing gain": r["claim3"]["vsSplit"]["mean"],
    }
    # row by row against the engine's own event file
    rows = {x["id"]: x for x in csv.DictReader(open("research/events.csv"))}
    row_bad = [e["id"] for e in events if e["id"] not in rows or abs(float(rows[e["id"]]["y"]) - e["y"]) > 1e-12 or abs(float(rows[e["id"]]["price"]) - e["price"]) > 1e-9]
    missing = sorted(set(rows) - {e["id"] for e in events})

    # an interval of its own, with a different random generator
    by = {}
    for e in test:
        g = by.setdefault(e["window"], [0.0, 0])
        g[0] += e["y"]; g[1] += 1
    groups, rnd, means = list(by.values()), random.Random(7), []
    for _ in range(4000):
        s = c = 0
        for _ in groups:
            g = groups[rnd.randrange(len(groups))]
            s += g[0]; c += g[1]
        means.append(s / c)
    means.sort()
    lo, hi = means[int(0.025 * 3999)], means[int(0.975 * 3999)]

    bad = [k for k in mine if abs(mine[k] - theirs[k]) > 1e-9]
    fmt = lambda v: f"{v:,}" if isinstance(v, int) else f"{v:.10f}"
    lines = ["# Audit: a second implementation", "",
             "Written by `python3 research/audit.py`. That script shares no code with the engine: it has its own",
             "calendar (Python's time-zone database), windows, scale, events, forecaster and outcomes. It reads the",
             "same recorded candles and recomputes the test set from scratch.", "",
             "| Figure | Engine (TypeScript) | Second implementation (Python) | Match |", "| --- | ---: | ---: | :---: |"]
    lines += [f"| {k} | {fmt(theirs[k])} | {fmt(mine[k])} | {'yes' if k not in bad else 'NO'} |" for k in mine]
    lines += ["", f"Row by row: {len(events):,} events recomputed, {len(row_bad)} differ from `research/events.csv`, {len(missing)} are in that file and not here.", "",
              f"Interval for the mean of Y, from 4,000 resamples of closed windows with a different random generator: "
              f"{lo * 1e4:+.1f} to {hi * 1e4:+.1f} basis points. The engine's: {r['claim1']['y']['lo'] * 1e4:+.1f} to {r['claim1']['y']['hi'] * 1e4:+.1f}.", "",
              "Result: " + ("every figure matches to ten decimal places." if not bad and not row_bad and not missing else "MISMATCH. Do not publish until this is resolved.")]
    open("research/AUDIT.md", "w").write("\n".join(lines) + "\n")
    print("\n".join(lines[6:]))
    sys.exit(1 if bad or row_bad or missing else 0)


if __name__ == "__main__":
    main()
