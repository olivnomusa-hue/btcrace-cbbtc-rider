// cbBTC long-only rider for make.fun bars-replay.
//
// The venue charges 4 bps fee + 2 bps slippage per side, so a round trip costs
// ~12 bps of notional, and the dev window (BTC +0.5% over 24h) does not pay for
// churn. So the plan is exposure, not activity:
//
//   1. once warm-up is over, put the whole account into cbBTC and sit on it;
//   2. remember the highest close since entry; if price breaks 3% under it,
//      dump the entire position (300 bps cap: getting out matters more than the
//      last few bps of impact) and remember the crash low;
//   3. while flat, wait until the low is repaired by 1.2% AND price is back
//      above the 240-bar EMA, then buy the account again.
//
// Everything is integer math on the 6-decimal price bigint: no floats, no
// clock, no randomness, so two runs of the same bars are byte-identical.
import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const EMA_LEN = 240n;
const EMA_DIV = EMA_LEN + 1n; // EMA recurrence denominator: (n-1)*prev + 2*close over n+1
const CRASH_BPS = 300n; // exit when close < peak * (1 - 3%)
const RECOVER_BPS = 120n; // re-enter when close >= low * 1.012
const BUY_SLIP_BPS = 100; // 1%
const SELL_SLIP_BPS = 300; // 3%: a crash exit must not be refused for impact
const MAX_WAIT_BARS = 3; // a sent order should fill on the next bar; retry after this

let ema: bigint | null = null; // long EMA, in price units
let peak = 0n; // highest close since the core position was taken
let trough = 0n; // lowest close of the current flat stretch after a stop-out
let stopped = false; // true from the crash exit until the recovery buy
let buyInFlight = false; // stops re-sending a buy during the 1-bar fill lag
let sellInFlight = false; // same for the crash exit
let waited = 0; // bars since the in-flight order was sent

/** EMA(n) over closes, kept exact: (prev * (n-1) + close * 2) / (n+1). */
function stepEma(close: bigint): bigint {
  if (ema === null) {
    ema = close;
    return ema;
  }
  ema = (ema * (EMA_LEN - 1n) + close * 2n) / EMA_DIV;
  return ema;
}

function buyAll(state: BarsState): OrderInput[] | null {
  if (state.cash <= 0n) return null;
  buyInFlight = true;
  waited = 0;
  return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: BUY_SLIP_BPS }];
}

function decide(state: BarsState): OrderInput[] | null {
  const close = state.close(SYMBOL);
  if (close === null) return null;

  const avg = stepEma(close);
  const qty = state.positions.get(SYMBOL)?.qty ?? 0n;

  // ---- holding: trail the peak and only leave on a real break ----
  if (qty > 0n) {
    buyInFlight = false;
    sellInFlight = false;
    waited = 0;
    if (peak === 0n || close > peak) peak = close;

    if (close * 10_000n < peak * (10_000n - CRASH_BPS)) {
      peak = 0n;
      trough = close;
      stopped = true;
      sellInFlight = true;
      waited = 0;
      return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: SELL_SLIP_BPS }];
    }
    return null;
  }

  // ---- flat: nothing to do during warm-up or before the EMA has history ----
  if (state.warmingUp || state.seq <= Number(EMA_LEN)) return null;

  if (sellInFlight) {
    // the exit has not filled yet: never decide a new entry on top of it
    if (++waited > MAX_WAIT_BARS) sellInFlight = false;
    return null;
  }

  if (stopped) {
    if (trough === 0n || close < trough) trough = close;
    // basis points, so divide by 10_000: close >= trough * (1 + 0.012)
    const repaired = trough > 0n && close * 10_000n >= trough * (10_000n + RECOVER_BPS);
    if (!repaired || close < avg) return null;

    stopped = false;
    peak = close;
    return buyAll(state);
  }

  // ---- first entry: one order, then hold ----
  if (buyInFlight) {
    if (++waited <= MAX_WAIT_BARS) return null;
    buyInFlight = false;
  }
  peak = close;
  return buyAll(state);
}

await runBars({ onBatch: decide });