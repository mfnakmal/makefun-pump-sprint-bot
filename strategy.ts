// DipSniper — an early-dip sniper with momentum pyramid adds.
//
// Buys pump.fun coins aged 1-5 slots that have fallen at least dipMinBps
// (vs creation price) from their peak runup, after the v1 rug filter
// (real SOL 0.3-30, creator buy <= 0.5 SOL, creator not sold, no outsider
// dump > 50% of reserve). Exits: stop -3%, take-profit +40%, max hold 20
// slots, exit if creator sells. Winners get up to 2 pyramid adds of 0.1
// SOL on +15% strength steps. The dip book is where the runners live:
// the age-0 sniper book never reaches +40%, but dip coins do, and adds
// into strength pay. Deterministic: decisions are a function of the
// batches seen. No randomness, no clock, no network.

import type { Batch, BotState, Order } from './vendor/makefun-bot.ts';

export interface Params {
  // --- entry window / rug filter ---
  minAgeSlots: number;
  maxAgeSlots: number;
  minRealSol: bigint;
  maxRealSol: bigint;
  maxDevBuy: bigint;
  minDevBuy: bigint;
  minBuyers: number;
  maxBuyers: number;
  maxSellRatioBps: number;
  maxBigSellBps: number;
  minRunupBps: number;
  maxRunupBps: number;
  flowWindowSlots: number;
  minFlow: bigint;
  skipDevSold: boolean;
  // --- sizing ---
  stake: bigint;
  addSize: bigint;
  minBuy: bigint;
  buySlippageBps: number;
  sellSlippageBps: number;
  // --- exits ---
  tpBps: number;
  slBps: number;
  trailArmBps: number;
  trailGiveBps: number;
  maxHoldSlots: number;
  staleSlots: number;
  exitOnDevSell: boolean;
  // --- partial take-profit: sell tp1PartBps of the position at tp1Bps,
  // then the stop moves to slAfterTp1Bps (0 = breakeven) ---
  tp1Bps: number;
  tp1PartBps: number;
  slAfterTp1Bps: number;
  // --- pyramid ---
  maxAdds: number;
  addStepBps: number;
  addDelaySlots: number;
  // --- (a) shareholder concentration: reject when the latest reported
  // top holder exceeds maxTopShareBps, or fewer than minHolders are
  // reported. Only applies when shareholders data exists (holderCount>0);
  // defaults (10000 / 0) disable the filter. ---
  maxTopShareBps: number;
  minHolders: number;
  // --- (b) stake-by-signal tiers: stakeStrong when outsiders bought at
  // least strongBuyThr in the create slot, stakeWeak when they bought at
  // most weakBuyThr. Threshold 0 = tier off; defaults equal stake. ---
  stakeWeak: bigint;
  stakeStrong: bigint;
  strongBuyThr: bigint;
  weakBuyThr: bigint;
  // --- (c) dip-buying: only active when minAgeSlots > 0; entry requires
  // the price to have fallen at least dipMinBps (vs creation price) from
  // its peak runup. ---
  dipMinBps: number;
  // --- dual book: entries aged > 0 slots use maxBuyersDip instead of
  // maxBuyers, so an age-0 sniper book and a dip book can run together
  // (minAgeSlots 0, maxAgeSlots 5, dipMinBps > 0, maxBuyers 1,
  // maxBuyersDip 100). Default 1 = same as maxBuyers. ---
  maxBuyersDip: number;
}

export const DEFAULT_PARAMS: Params = {
  minAgeSlots: 1,
  maxAgeSlots: 5,
  minRealSol: 300_000_000n,
  maxRealSol: 30_000_000_000n,
  maxDevBuy: 500_000_000n,
  minDevBuy: 0n,
  minBuyers: 0,
  maxBuyers: 1,
  maxSellRatioBps: 10000,
  maxBigSellBps: 5000,
  minRunupBps: 0,
  maxRunupBps: 1000000,
  flowWindowSlots: 10,
  minFlow: -1_000_000_000_000n,
  skipDevSold: true,
  stake: 100_000_000n,
  addSize: 100_000_000n,
  minBuy: 10_000_000n,
  buySlippageBps: 2000,
  sellSlippageBps: 2000,
  tpBps: 4000,
  slBps: 300,
  trailArmBps: 100000,
  trailGiveBps: 1000,
  maxHoldSlots: 20,
  staleSlots: 1000000,
  exitOnDevSell: true,
  tp1Bps: 100000,
  tp1PartBps: 5000,
  slAfterTp1Bps: 0,
  maxAdds: 2,
  addStepBps: 1500,
  addDelaySlots: 2,
  maxTopShareBps: 10000,
  minHolders: 0,
  stakeWeak: 100_000_000n,
  stakeStrong: 100_000_000n,
  strongBuyThr: 0n,
  weakBuyThr: 0n,
  dipMinBps: 1500,
  maxBuyersDip: 100,
};

const BPS = 10000n;

interface Tick {
  slot: number;
  signedSol: bigint;
}

interface CoinBook {
  createdSlot: number;
  creator: string;
  vq0: bigint;
  vt0: bigint;
  devBuy: bigint;
  devSold: boolean;
  buyers: Set<string>;
  soldByOthers: bigint;
  boughtByOthers: bigint;
  bigSell: boolean;
  lastTradeSlot: number;
  lastTradeFeeBps: number;
  lastTradeCreatorFeeBps: number;
  ticks: Tick[];
  done: boolean;
  // (a) latest reported shareholders (0 holders = never reported)
  topShareBps: number;
  holderCount: number;
  // (c) peak price vs creation price, in bps (updated per TradeEvent)
  peakRunupBps: number;
}

interface HeldBook {
  openedSlot: number;
  cost: bigint;
  best: bigint;
  adds: number;
  lastBuySlot: number;
  lastBuyVq: bigint;
  lastBuyVt: bigint;
  exiting: boolean;
  tookTp1: boolean;
  lastSellTokens: bigint;
}

export function createStrategy(p0: Params) {
  // Normalise bigint params: JSON-passed overrides arrive as numbers.
  const asBig = (v: bigint | number): bigint => (typeof v === 'bigint' ? v : BigInt(v));
  const p: Params = {
    ...p0,
    minRealSol: asBig(p0.minRealSol),
    maxRealSol: asBig(p0.maxRealSol),
    maxDevBuy: asBig(p0.maxDevBuy),
    minDevBuy: asBig(p0.minDevBuy),
    minFlow: asBig(p0.minFlow),
    stake: asBig(p0.stake),
    addSize: asBig(p0.addSize),
    minBuy: asBig(p0.minBuy),
    stakeWeak: asBig(p0.stakeWeak),
    stakeStrong: asBig(p0.stakeStrong),
    strongBuyThr: asBig(p0.strongBuyThr),
    weakBuyThr: asBig(p0.weakBuyThr),
  };
  const coins = new Map<string, CoinBook>();
  const held = new Map<string, HeldBook>();

  function foldEvents(batch: Batch): void {
    for (const e of batch.events) {
      if (e.event === 'CreateEvent') {
        coins.set(e.mint, {
          createdSlot: e.slot,
          creator: e.creator,
          vq0: BigInt(e.virtual_quote_reserves),
          vt0: BigInt(e.virtual_token_reserves),
          devBuy: 0n,
          devSold: false,
          buyers: new Set<string>(),
          soldByOthers: 0n,
          boughtByOthers: 0n,
          bigSell: false,
          lastTradeSlot: e.slot,
          lastTradeFeeBps: 95,
          lastTradeCreatorFeeBps: 30,
          ticks: [],
          done: false,
          topShareBps: 0,
          holderCount: 0,
          peakRunupBps: 0,
        });
      } else if (e.event === 'TradeEvent') {
        const c = coins.get(e.mint);
        if (c === undefined) continue;
        const sol = BigInt(e.sol_amount);
        // (a) shareholders: only non-empty reports carry signal; an empty
        // array means "not reported", not "no holders", so keep last known.
        const sh = (e as any).shareholders as Array<{ address: string; share_bps: number }> | undefined;
        if (sh !== undefined && sh.length > 0) {
          c.holderCount = sh.length;
          let top = 0;
          for (const h of sh) if (h.share_bps > top) top = h.share_bps;
          c.topShareBps = top;
        }
        // (c) track peak runup from this trade's virtual reserves.
        if (c.vq0 > 0n && c.vt0 > 0n) {
          const vq = BigInt(e.virtual_quote_reserves);
          const vt = BigInt(e.virtual_token_reserves);
          if (vt > 0n) {
            const r = Number(((vq * c.vt0 - c.vq0 * vt) * BPS) / (c.vq0 * vt));
            if (r > c.peakRunupBps) c.peakRunupBps = r;
          }
        }
        if (e.is_buy) {
          if (e.user === c.creator) c.devBuy += sol;
          else {
            c.buyers.add(e.user);
            c.boughtByOthers += sol;
          }
          c.ticks.push({ slot: e.slot, signedSol: sol });
        } else {
          if (e.user === c.creator) {
            c.devSold = true;
          } else {
            c.soldByOthers += sol;
            // One outsider dump larger than maxBigSellBps of the real
            // reserve at the time is a rug tell.
            const rq = BigInt(e.real_quote_reserves);
            if (sol * BPS > rq * BigInt(p.maxBigSellBps)) c.bigSell = true;
          }
          c.ticks.push({ slot: e.slot, signedSol: -sol });
        }
        c.lastTradeSlot = e.slot;
        const fb = BigInt(e.fee_basis_points);
        if (fb > 0n) {
          c.lastTradeFeeBps = Number(fb);
          c.lastTradeCreatorFeeBps = Number(BigInt(e.creator_fee_basis_points));
        }
      } else if (e.event === 'CompleteEvent') {
        const c = coins.get(e.mint);
        if (c !== undefined) c.done = true;
      }
    }
  }

  function flowInWindow(c: CoinBook, nowSlot: number): bigint {
    let f = 0n;
    for (let i = c.ticks.length - 1; i >= 0; i--) {
      const t = c.ticks[i]!;
      if (nowSlot - t.slot > p.flowWindowSlots) break;
      f += t.signedSol;
    }
    return f;
  }

  /** Net SOL back from selling `tokens` now, after curve fees and tx fee. */
  function netSellValue(state: BotState, mint: string, tokens: bigint): bigint {
    const curve = state.curves.get(mint);
    if (curve === undefined || tokens === 0n) return 0n;
    const vq = curve.virtual_quote_reserves;
    const vt = curve.virtual_token_reserves;
    const book = coins.get(mint);
    const feeBps = BigInt(book?.lastTradeFeeBps ?? 95);
    const creatorBps = BigInt(book?.lastTradeCreatorFeeBps ?? 30);
    const gross = (tokens * vq) / (vt + tokens);
    const fee = (gross * feeBps + BPS - 1n) / BPS;
    const cf = (gross * creatorBps + BPS - 1n) / BPS;
    const net = gross - fee - cf - state.txFeeLamports();
    return net > 0n ? net : 0n;
  }

  /** Current price vs creation price, in bps. price = vq / vt. */
  function runupBps(c: CoinBook, vq: bigint, vt: bigint): number {
    if (c.vq0 === 0n || c.vt0 === 0n || vt === 0n) return 0;
    const num = vq * c.vt0 - c.vq0 * vt;
    const den = c.vq0 * vt;
    return Number((num * BPS) / den);
  }

  return {
    onBatch(state: BotState, batch: Batch): Order[] {
      const slot = batch.slot;
      const txFee = state.txFeeLamports();
      foldEvents(batch);
      const orders: Order[] = [];
      const pendingBuy = new Set<string>();
      for (const po of state.pending.values()) {
        if (po.order.side === 'buy') pendingBuy.add(po.order.mint);
      }
      // Cash already spoken for by the orders I am about to send this batch.
      let committedCash = 0n;

      // --- sync held book with fills: cost basis, adds, exits ---
      for (const f of batch.fills) {
        if (f.side === 'buy') {
          if (f.status !== 'filled') continue;
          const h = held.get(f.mint);
          const paid = BigInt(f.quote_lamports) + BigInt(f.tx_fee_lamports);
          const curve = state.curves.get(f.mint);
          if (h === undefined) {
            held.set(f.mint, {
              openedSlot: slot,
              cost: paid,
              best: 0n,
              adds: 0,
              lastBuySlot: slot,
              lastBuyVq: curve?.virtual_quote_reserves ?? 0n,
              lastBuyVt: curve?.virtual_token_reserves ?? 0n,
              exiting: false,
              tookTp1: false,
              lastSellTokens: 0n,
            });
          } else {
            h.cost += paid;
            h.adds += 1;
            h.lastBuySlot = slot;
            if (curve !== undefined) {
              h.lastBuyVq = curve.virtual_quote_reserves;
              h.lastBuyVt = curve.virtual_token_reserves;
            }
          }
        } else if (f.side === 'sell') {
          const h = held.get(f.mint);
          if (h === undefined) continue;
          if (f.status === 'filled') {
            const pos = state.positions.get(f.mint);
            if (pos === undefined || pos.token_amount === 0n) {
              held.delete(f.mint);
            } else {
              // Partial fill: scale the cost basis down to the tokens left,
              // reset the trailing tracker, re-arm for a retry.
              const sold = BigInt(f.token_amount);
              const total = pos.token_amount + sold;
              if (total > 0n) h.cost = (h.cost * pos.token_amount) / total;
              h.best = 0n;
              h.exiting = false;
              h.lastSellTokens = 0n;
            }
          } else if (f.status === 'rejected' || f.status === 'failed') {
            h.exiting = false; // exit did not go through: retry next batch
            h.lastSellTokens = 0n;
          }
        }
      }

      // --- exits first, so a freed slot can be reused by an entry below ---
      for (const [mint, pos] of state.positions) {
        if (pos.token_amount === 0n) continue;
        const h = held.get(mint);
        if (h === undefined || h.exiting) continue;
        const curve = state.curves.get(mint);
        if (curve === undefined || curve.complete) continue;
        const book = coins.get(mint);
        const value = netSellValue(state, mint, pos.token_amount);
        if (value > h.best) h.best = value;
        const pnlBps = h.cost > 0n ? Number(((value - h.cost) * BPS) / h.cost) : 0;
        const age = slot - h.openedSlot;
        const stale = book === undefined ? 0 : slot - book.lastTradeSlot;
        const armed = pnlBps >= p.trailArmBps;
        const trailHit = armed && value * BPS <= (h.best * (BPS - BigInt(p.trailGiveBps))) / 1n;
        const devDumped = p.exitOnDevSell && book !== undefined && book.devSold;
        // Partial take-profit first: bank half at tp1Bps, then the stop
        // moves to breakeven and the rest rides the trailing stop.
        if (!h.tookTp1 && pnlBps >= p.tp1Bps) {
          const part = (pos.token_amount * BigInt(p.tp1PartBps)) / BPS;
          if (part > 0n) {
            orders.push({
              side: 'sell',
              mint,
              token_amount: part.toString(),
              max_slippage_bps: p.sellSlippageBps,
              client_id: state.clientId(),
            });
            h.tookTp1 = true;
            h.exiting = true;
            h.lastSellTokens = part;
            continue;
          }
        }
        const effSl = h.tookTp1 ? p.slAfterTp1Bps : p.slBps;
        if (
          pnlBps <= -effSl ||
          pnlBps >= p.tpBps ||
          trailHit ||
          age >= p.maxHoldSlots ||
          stale >= p.staleSlots ||
          devDumped
        ) {
          orders.push({
            side: 'sell',
            mint,
            token_amount: pos.token_amount.toString(),
            max_slippage_bps: p.sellSlippageBps,
            client_id: state.clientId(),
          });
          h.exiting = true;
        }
      }

      // --- pyramid adds on strength ---
      for (const [mint, pos] of state.positions) {
        if (pos.token_amount === 0n) continue;
        const h = held.get(mint);
        if (h === undefined || h.exiting || h.adds >= p.maxAdds) continue;
        if (pendingBuy.has(mint)) continue;
        const curve = state.curves.get(mint);
        const book = coins.get(mint);
        if (curve === undefined || curve.complete || book === undefined) continue;
        if (slot - h.lastBuySlot < p.addDelaySlots) continue;
        // Price must be at least addStepBps above the last buy price:
        // vq/vt now >= vq_buy/vt_buy * (1 + step).
        const stepOk =
          h.lastBuyVt > 0n &&
          curve.virtual_token_reserves * h.lastBuyVt * BPS >=
            h.lastBuyVq * curve.virtual_token_reserves * (BPS + BigInt(p.addStepBps));
        if (!stepOk) continue;
        if (flowInWindow(book, slot) < 0n) continue;
        const cap = state.maxBuyLamports(mint);
        let size = p.addSize;
        if (size > cap) size = cap;
        if (size < p.minBuy) continue;
        if (size + txFee > state.freeCashLamports() - committedCash) continue;
        orders.push({
          side: 'buy',
          mint,
          quote_lamports: size.toString(),
          max_slippage_bps: p.buySlippageBps,
          client_id: state.clientId(),
        });
        committedCash += size + txFee;
        pendingBuy.add(mint);
      }

      // --- new entries: fresh launches that pass the rug filter ---
      let newBuys = 0;
      for (const [mint, book] of coins) {
        if (state.committedPositionCount() + newBuys >= 5) break;
        if (book.done) continue;
        const age = slot - book.createdSlot;
        if (age < p.minAgeSlots || age > p.maxAgeSlots) continue;
        if (state.positions.has(mint) || pendingBuy.has(mint)) continue;
        const curve = state.curves.get(mint);
        if (curve === undefined || curve.complete) continue;
        const rq = curve.real_quote_reserves;
        if (rq < p.minRealSol || rq > p.maxRealSol) continue;
        if (book.devBuy > p.maxDevBuy) continue;
        if (book.devBuy < p.minDevBuy) continue;
        if (book.buyers.size < p.minBuyers) continue;
        if (book.buyers.size > (age === 0 ? p.maxBuyers : p.maxBuyersDip)) continue;
        if (p.skipDevSold && book.devSold) continue;
        if (book.bigSell) continue;
        // (a) shareholder concentration (only when data was reported).
        if (book.holderCount > 0) {
          if (book.topShareBps > p.maxTopShareBps) continue;
          if (book.holderCount < p.minHolders) continue;
        }
        // Sell pressure: outsiders must not have dumped more than
        // maxSellRatioBps of what outsiders bought in.
        if (book.soldByOthers * BPS > book.boughtByOthers * BigInt(p.maxSellRatioBps)) continue;
        const runup = runupBps(book, curve.virtual_quote_reserves, curve.virtual_token_reserves);
        if (runup < p.minRunupBps || runup > p.maxRunupBps) continue;
        // (c) dip-buying: aged entries require a fall of at least
        // dipMinBps from the peak runup (only when dipMinBps > 0).
        if (age > 0 && p.dipMinBps > 0 && book.peakRunupBps - runup < p.dipMinBps) continue;
        if (flowInWindow(book, slot) < p.minFlow) continue;
        const cap = state.maxBuyLamports(mint);
        // (b) stake-by-signal tiers on outsider buys in the create slot.
        let size = p.stake;
        if (p.strongBuyThr > 0n && book.boughtByOthers >= p.strongBuyThr) size = p.stakeStrong;
        else if (p.weakBuyThr > 0n && book.boughtByOthers <= p.weakBuyThr) size = p.stakeWeak;
        if (size > cap) size = cap;
        if (size < p.minBuy) continue;
        if (size + txFee > state.freeCashLamports() - committedCash) continue;
        orders.push({
          side: 'buy',
          mint,
          quote_lamports: size.toString(),
          max_slippage_bps: p.buySlippageBps,
          client_id: state.clientId(),
        });
        committedCash += size + txFee;
        pendingBuy.add(mint);
        newBuys += 1;
      }

      return orders;
    },
  };
}
