[![make.fun · u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4](https://make.fun/badge/u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4.svg)](https://make.fun/bounty/u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4?utm_source=github&utm_medium=readme&utm_campaign=u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4)
[![rank](https://make.fun/badge/u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4/mfnakmal/makefun-pump-sprint-bot/rank.svg)](https://make.fun/bounty/u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4)
[![reward](https://make.fun/badge/u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4/mfnakmal/makefun-pump-sprint-bot/reward.svg)](https://make.fun/bounty/u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4?utm_source=github&utm_medium=readme&utm_campaign=u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4)

# TailSniper — Pump Sprint: 12-Hour Paper Trading Dash

A launch sniper for the make.fun pump.fun replay competition. It buys fresh
pump.fun launches in their create slot (with a tight rug filter), then exits
fast: tight stop −3%, take-profit +25%, max hold 20 slots.

## What the data said

Dev window: 24h of pump.fun chain data, 1,222 coins (1/16 sample).

- Median peak return after the first trade: **1.10x**. Only 15% of coins ever
  peak ≥ 2x, 8% ≥ 3x, 5% ≥ 5x, 2.8% ≥ 10x. The tail is real but thin.
- Buying trade #1 and selling 2 trades later wins 92% of the time — but that
  is survivorship-biased (only coins with 3+ trades), and the median gain is
  only +8%.
- A round trip costs ~2.5–2.9%: 1.25% curve fees each way plus 0.000105 SOL
  tx fee per order. On a 0.1 SOL stake that is ~0.0029 SOL per round trip.
- Early-flow features barely predict ≥ 2x peaks (base rate 15%): the best
  single signal is real reserve ≥ 10 SOL after trade 3 (25% hit rate).
- The kit pilots all lose on the dev window: equal-weight −0.019 SOL,
  sniper −0.49 SOL, reversion −4.17 SOL, momentum −9.47 SOL.

## Strategy

1. **Entry — snipe launches in the create slot only (age 0).** A launch
   passes the rug filter only if real SOL is 0.3–30, the creator bought
   ≤ 0.5 SOL, at most 1 other wallet bought in, the creator has not sold,
   no single outsider dump exceeds 50% of the real reserve, and outsider
   sells do not exceed outsider buys.
2. **Size — 0.1 SOL per coin**, capped at 1% of the coin's real reserve
   (the harness cap), minimum buy 0.01 SOL so every round trip counts toward
   the 20-coin minimum bar. At most 5 open positions.
3. **Exits — tight stop −3%, take-profit +25%, max hold 20 slots**,
   immediate exit if the creator sells. No trailing stop, no partial TP, no
   pyramid adds: all three were swept and all lose more on the dev window
   (the tail is too thin to pay for the give-back; adds average into
   losers).
4. **No order splitting.** The 1% size cap is per reply, not per order, so
   splitting only burns an extra tx fee per piece.

Everything is deterministic: every decision is a function of the batches
seen — no randomness, no clock, no network. Client ids come from the SDK
counter.

## Results (dev window, `grade-local --driver process`)

- **Net PnL −0.0457 SOL** (−0.46%), 44 round trips / 44 distinct mints,
  88 fills, win rate 9.1%, max drawdown 0.59%.
- **Guardrails: all pass** — 44 ≥ 20 coins, drawdown 0.59% ≤ 50%.
- **Deterministic**: the two graded runs produce byte-identical action
  logs (`l1.reproduced: true`).
- 90% bootstrap interval over coins: **[−0.113, +0.029] SOL** — the
  strategy is statistically indistinguishable from zero on this window.
- **Concentration warning**: 99.75% of all gains come from the top 3
  coins; net PnL without them is −0.0873 SOL. The strategy is a
  lottery-ticket sniper: 1 coin in ~40 pays, the rest bleed fees.
- Fees: 0.0404 SOL curve fees + 0.0093 SOL tx fees; gross trading PnL
  before fees ≈ +0.004 SOL — the price edge is ~zero and the fees make
  it negative. The bet is that a fresh 6h window with more runners flips
  it, and that a tight, low-drawdown sniper beats the field.
- Comparison on the same dev window: sniper pilot −0.49 SOL, reversion
  pilot −4.17 SOL, momentum pilot −9.47 SOL. The equal-weight baseline
  (−0.019 SOL) is better on PnL but buys only 5 coins and **fails the
  20-coin guardrail**, so it is not a valid entry.
- **Stress test (`grade-local --stress 20`)**: 20 rebuilt copies of the dev
  window — median −0.041 SOL, p10 −0.101, p90 +0.025, **15/20 copies lost
  money**, 0 failed, best copy +0.155 SOL, worst −0.123 SOL. The dev
  score ranks 9th of 21 (dev + copies) — exactly median, not a fluke high
  or low. Honest read: slightly negative expected value, with a real
  upside tail when a window contains a runner the filter catches.

## Layout

- `main.ts` — entrypoint: hands the strategy to the kit SDK's `runBot`.
- `strategy.ts` — the whole strategy (entry filter, exits, pyramid adds).
- `vendor/makefun-bot.ts` — the kit SDK, vendored (excluded from authorship
  counts by the make.fun transcript gate).
- `.makefun/owner.json` — payout wallet claim.

## License

MIT — see `LICENSE`.
