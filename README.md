[![make.fun · u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4](https://make.fun/badge/u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4.svg)](https://make.fun/bounty/u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4?utm_source=github&utm_medium=readme&utm_campaign=u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4)
[![rank](https://make.fun/badge/u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4/mfnakmal/makefun-pump-sprint-bot/rank.svg)](https://make.fun/bounty/u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4)
[![reward](https://make.fun/badge/u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4/mfnakmal/makefun-pump-sprint-bot/reward.svg)](https://make.fun/bounty/u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4?utm_source=github&utm_medium=readme&utm_campaign=u-kiencx-pump-sprint-12-hour-paper-trading-dash-29aa76d4)

# DipSniper — Pump Sprint: 12-Hour Paper Trading Dash (v2)

An early-dip sniper for the make.fun pump.fun replay competition. It buys
pump.fun coins aged 1–5 slots that have fallen at least 15% from their
peak runup, after a tight rug filter — then exits with a stop −3%,
take-profit +40%, max hold 20 slots, and up to 2 pyramid adds of 0.1 SOL
into strength.

v2 replaces the v1 launch sniper (TailSniper, submitted 23 Nov 2026,
dev PnL −0.0457 SOL). v1 is kept in git history; see below for why the
dip book won.

## What the data said

Dev window: 24h of pump.fun chain data, 1,222 coins (1/16 sample).

- Median peak return after the first trade: **1.10x**. Only 15% of coins ever
  peak ≥ 2x, 8% ≥ 3x, 5% ≥ 5x, 2.8% ≥ 10x. The tail is real but thin.
- A round trip costs ~2.5–2.9%: 1.25% curve fees each way plus 0.000105 SOL
  tx fee per order. On a 0.1 SOL stake that is ~0.0029 SOL per round trip
  (the true marginal fee is ~2.71% per round trip, not the 1.13% implied
  by v1's capped buys).
- The kit pilots all lose on the dev window: equal-weight −0.019 SOL,
  sniper −0.49 SOL, reversion −4.17 SOL, momentum −9.47 SOL.

## Strategy

1. **Entry — buy the early dip, not the launch.** A coin aged 1–5 slots
   passes only if it has fallen at least 15% (dipMinBps 1500) from its
   peak runup vs creation price, and passes the v1 rug filter: real SOL
   0.3–30, creator bought ≤ 0.5 SOL, creator has not sold, no single
   outsider dump exceeds 50% of the real reserve, outsider sells do not
   exceed outsider buys. The edge lives only in very early dips
   (age ≤ 5 slots); dips aged 6+ slots bleed on the dev window.
2. **Size — 0.1 SOL per coin**, capped at 1% of the coin's real reserve
   (the harness cap), minimum buy 0.01 SOL so every round trip counts
   toward the 20-coin minimum bar. At most 5 open positions.
3. **Exits — tight stop −3%, take-profit +40%, max hold 20 slots**,
   immediate exit if the creator sells. Dip coins are the ones that run:
   the age-0 sniper book never reaches +40% before stop/hold/dev-sell,
   but dip coins do.
4. **Pyramid adds — up to 2 adds of 0.1 SOL** on +15% strength steps
   above the last buy price, only while flow in the last 10 slots is
   non-negative. Adds pay on the dip book (they lost on the sniper book).
5. **No order splitting.** The 1% size cap is per reply, not per order,
   so splitting only burns an extra tx fee per piece.

What did NOT work (swept, all lose more on dev): shareholder-concentration
filter (the `shareholders` field is empty on 95% of trades — no signal at
entry), stake-by-signal (the 1% reserve cap neuters sizing tiers; the
signal does not predict winners), momentum entries (best confirmed-runner
variant −0.0296 SOL on grade-local; a naive +5%/30-trade replica loses
−9.92 SOL), running sniper + dip books together (the losing sniper book
drags the dip book down), trailing stops and partial take-profits.

Everything is deterministic: every decision is a function of the batches
seen — no randomness, no clock, no network. Client ids come from the SDK
counter.

## Results (dev window, `grade-local --driver process`)

- **Net PnL +0.0811 SOL** (+0.81%), 24 round trips / 23 distinct mints,
  55 fills, win rate 37.5%, max drawdown 0.43%.
- **Guardrails: all pass** — 23 ≥ 20 coins, drawdown 0.43% ≤ 50%.
- **Deterministic**: the two graded runs produce byte-identical action
  logs (`l1.reproduced: true`).
- 90% bootstrap interval over coins: **[−0.056, +0.258] SOL**.
- Fees: 0.0633 SOL curve fees + 0.0059 SOL tx fees; **at 2x fees net PnL
  is still +0.0350 SOL**.
- Sim (`tools/sim.ts`, same window): net **+0.0991 SOL**, halves
  [+0.078/+0.021] (both positive), 22 mints, maxDD 0.28%.
- **Concentration warning**: top 3 coins make 87% of the gains; net PnL
  without the best coin is still +0.0191 SOL (sim), without the top 3
  it is −0.06 SOL (grade). The strategy is still a lottery ticket —
  just a better-priced one than v1.
- **Stress test (`grade-local --stress 20`, 14/20 windows known — run cut
  by a 3500s timeout)**: +0.01 / −0.02 / −0.08 / −0.04 / −0.07 / +0.04 /
  +0.12 / −0.08 / −0.08 / −0.16 / +0.10 / −0.07 / −0.11 / −0.07 →
  **4/14 windows positive (29%), median −0.07 SOL**. Honest read: the
  dev-positive result is likely tail-luck (windows without 2–3 big
  winning coins go negative), not a spread edge. The last 6 stress
  windows are unknown.
- v1 comparison (same dev window): TailSniper −0.0457 SOL grade-local,
  44 round trips, win rate 9.1%, stress median −0.041 SOL (15/20 lost).
  v2 flips the dev sign and triples the win rate, but its stress median
  is worse — the final 6h window decides everything.

## Layout

- `main.ts` — entrypoint: hands the strategy to the kit SDK's `runBot`.
- `strategy.ts` — the whole strategy (entry filter, dip logic, exits,
  pyramid adds).
- `vendor/makefun-bot.ts` — the kit SDK, vendored (excluded from authorship
  counts by the make.fun transcript gate).
- `.makefun/owner.json` — payout wallet claim.

## License

MIT — see `LICENSE`.
