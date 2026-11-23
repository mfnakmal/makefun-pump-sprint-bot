// DipSniper — Pump Sprint entry v2.
//
// An early-dip sniper with momentum pyramid adds. It buys pump.fun coins
// aged 1-5 slots that have fallen at least 15% (dipMinBps 1500) from
// their peak runup, after the v1 rug filter (real SOL 0.3-30, creator
// buy <= 0.5 SOL, creator has not sold, no outsider dump > 50% of
// reserve). Stake 0.1 SOL, stop -3%, take-profit +40%, max hold 20
// slots, exit if the creator sells. Winners get up to 2 pyramid adds
// of 0.1 SOL on +15% strength steps. See strategy.ts for the design
// and README.md for the numbers behind it.

import { runBot } from './vendor/makefun-bot.ts';
import { createStrategy, DEFAULT_PARAMS } from './strategy.ts';

const strategy = createStrategy(DEFAULT_PARAMS);

await runBot({
  onBatch(state, batch) {
    return strategy.onBatch(state, batch);
  },
});
