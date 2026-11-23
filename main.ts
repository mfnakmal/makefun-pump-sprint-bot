// TailSniper — Pump Sprint entry.
//
// A launch sniper with a tight rug filter: it buys fresh pump.fun launches
// in their create slot (age 0), then exits fast — stop -3%, take-profit
// +25%, max hold 20 slots. See strategy.ts for the design and README.md
// for the numbers behind it.

import { runBot } from './vendor/makefun-bot.ts';
import { createStrategy, DEFAULT_PARAMS } from './strategy.ts';

const strategy = createStrategy(DEFAULT_PARAMS);

await runBot({
  onBatch(state, batch) {
    return strategy.onBatch(state, batch);
  },
});
