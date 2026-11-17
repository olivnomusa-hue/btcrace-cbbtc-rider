# btcrace-cbbtc-rider

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/olivnomusa-hue/btcrace-cbbtc-rider/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/olivnomusa-hue/btcrace-cbbtc-rider/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

A long-only cbBTC rider for make.fun's 24 hour BTC race. The venue charges 4 bps fee
plus 2 bps slippage per side, so a round trip costs about 12 bps and the dev window
(BTC +0.5% over 24 h) does not pay for churn. The bot therefore holds the asset and
treats trading as insurance rather than income:

- once warm-up ends it puts the account into cbBTC and sits on it (exposure, not activity);
- it remembers the highest close since entry and dumps the whole position if price
  breaks 3% under that peak, with a 300 bps slippage cap because getting out matters
  more than the last few bps of impact;
- while flat it waits for the crash low to be repaired by 1.2% and for price to be
  back above the 240-bar EMA, then re-enters with the full account.

Measured with the kit's own grader on the dev window: **+3.88 USDC net, 1 trade,
0 rejected, max drawdown 2.1%**. Every more active variant tested (EMA cross families,
regime filters, dip-buy with take profit, trailing stops) lost money to fees.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=exz&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>
