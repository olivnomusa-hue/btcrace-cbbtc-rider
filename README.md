# btc-race bot — cbBTC long rider

Strategy for make.fun `btc-race-24h-20261117-0603` (cbBTC, Orca Whirlpool, Solana, paper money).

## Why it is mostly passive

The venue charges **4 bps fee + 2 bps slippage per side**, so a round trip costs ~12 bps of
notional. The dev window moves +0.49% over 24h, which does not pay for churn: every active
strategy tested (EMA crosses 10/90…90/480 with hysteresis, momentum 60-bar, dip-buy plus
take-profit, trailing stops 0.5–1.2%) came out negative.

## The rule set (all integer math on the 6-decimal price)

1. **Warm-up / history gate.** No order while `state.warmingUp` is true or `state.seq <= 240`;
   the 240-bar EMA is only meaningful after that.
2. **Core entry.** As soon as the gate opens and the account is flat, buy the whole cash balance
   (`notional_quote_units = state.cash`, `max_slippage_bps = 100`), then hold.
3. **Crash stop.** While long, remember the highest close seen (`peak`). If close < `peak * 0.97`,
   sell **all** of it with `max_slippage_bps = 300` — a crash exit must never be refused for
   impact — and remember the crash low.
4. **Re-entry.** While flat and stopped out, wait until the low is repaired by 1.2%
   (close >= low * 1.012) **and** price is back above the 240-bar EMA, then buy the account again.
5. **In-flight guards.** A `buyInFlight` / `sellInFlight` flag (plus a 3-bar bail-out) stops the
   same order being re-sent on every bar of the one-bar fill lag.

No clock, no randomness, no I/O: two runs over the same bars are byte-identical.

## Verified locally (`grade-local --driver process --worktree`)

| build | net PnL | trades | rejected | status |
|---|---|---|---|---|
| this bot, dev window | **+3.879612 USDC** | 1 | 0 | finished |
| crash-threshold test (CRASH 0.3%, RECOVER 0.4%) | −42.370437 USDC | 26 | 0 | finished |

The second build exists only to force the stop-out / re-entry path to cycle; its loss is the
expected fee bleed from 13 round trips, and it finishes with no rejected orders and no runtime
error.

`main.ts` is the entrypoint; `vendor/makefun-bars.ts` is the kit's wire shim.
