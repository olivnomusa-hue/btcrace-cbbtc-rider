// cbBTC core-long rider: holds the asset, steps out only on a hard crash,
// and re-enters once price recovers above its long EMA. Fee-aware: at 6 bps a
// round trip, active trading bleeds the account, so the default is exposure.
import { runBars } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const RISK_BPS = 10000n;   // full cash on entries (weight cap enforced by the venue)
const SLIP_BPS = 100;      // accept up to 1% slippage+impact
const CRASH = 0.03;        // sell when price falls this far below its peak
const RECOVER = 0.012;     // after a stop, rebuy once price is this far off the low
const EMA_N = 240;         // long EMA used only as a re-entry sanity filter

type State = Parameters<Parameters<typeof runBars>[0]['onBatch']>[0];
type Order =
  | { side: 'buy'; symbol: string; notional_quote_units: bigint; max_slippage_bps: number }
  | { side: 'sell'; symbol: string; qty: bigint; max_slippage_bps: number };

let peak = 0;
let low = 0;
let stopped = false;
let ema: number | null = null;
const alpha = 2 / (EMA_N + 1);

function onBatch(state: State): Order[] | null {
  const c = state.close(SYMBOL);
  if (c === null) return null;
  const price = Number(c);

  ema = ema === null ? price : ema + alpha * (price - ema);
  const held = state.positions.get(SYMBOL)?.qty ?? 0n;

  if (held > 0n) {
    if (price > peak) peak = price;
    if (peak > 0 && price < peak * (1 - CRASH)) {
      stopped = true;
      low = price;
      peak = 0;
      return [{ side: 'sell', symbol: SYMBOL, qty: held, max_slippage_bps: SLIP_BPS }];
    }
    return null; // stay long; fees punish churn
  }

  if (state.warmingUp || state.seq <= EMA_N) return null;
  if (price < low) low = price;

  if (stopped) {
    // wait for a real recovery off the crash low before taking risk again
    if (low > 0 && price >= low * (1 + RECOVER) && price >= ema) {
      stopped = false;
      peak = price;
      const spend = (state.cash * RISK_BPS) / 10000n;
      if (spend <= 0n) return null;
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: SLIP_BPS }];
    }
    return null;
  }

  // fresh start: take the core position once
  peak = price;
  const spend = (state.cash * RISK_BPS) / 10000n;
  if (spend <= 0n) return null;
  return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: SLIP_BPS }];
}

await runBars({ onBatch });