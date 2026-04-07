/**
 * Trading Strategies — 20-year Wall Street trader playbook.
 *
 * Each strategy evaluates an IndicatorSummary and returns a score 0-100
 * (0 = no signal, 100 = maximum conviction).  Scores ≥ 50 are tradeable;
 * ≥ 70 are high-conviction; ≥ 85 are rare, maximum-size plays.
 *
 * Risk framework:
 *   - Stop-loss:   ATR × 1.5 below entry (never more than 3%)
 *   - Take-profit: 3 × risk (R:R = 1:3)
 *   - Max loss/day: 50% of daily budget ($25 CAD)
 */

import type { IndicatorSummary } from './indicators';

export type StrategyName = 'MOMENTUM' | 'GAP' | 'BREAKOUT' | 'MEAN_REVERSION';

export interface StrategySignal {
    strategy: StrategyName;
    direction: 'BUY' | 'SELL';
    strength: number; // 0-100
    entryLow: number;
    entryHigh: number;
    stopLoss: number;
    takeProfit: number;
    catalysts: string[];
}

// ─── Helper ────────────────────────────────────────────────────────────────────

function clamp(n: number, min = 0, max = 100): number {
    return Math.max(min, Math.min(max, n));
}

function stopAndTarget(
    price: number,
    atr: number,
    direction: 'BUY' | 'SELL',
    atrMultiplier = 1.5,
    rrRatio = 3
): { stopLoss: number; takeProfit: number } {
    const risk = Math.min(atr * atrMultiplier, price * 0.03); // cap at 3%
    if (direction === 'BUY') {
        return {
            stopLoss: +(price - risk).toFixed(4),
            takeProfit: +(price + risk * rrRatio).toFixed(4),
        };
    } else {
        return {
            stopLoss: +(price + risk).toFixed(4),
            takeProfit: +(price - risk * rrRatio).toFixed(4),
        };
    }
}

// ─── 1. MOMENTUM ───────────────────────────────────────────────────────────────
/**
 * Rides an existing trend.
 * Best when: RSI 45-65, EMA9>EMA21>EMA50, volume >2× avg, MACD histogram positive.
 * Target: +7-10%, stop 2-3%.
 */
export function scoreМomentum(ind: IndicatorSummary): StrategySignal | null {
    const { rsi, ema9, ema21, ema50, macd, macdSignal, macdHistogram, volumeRatio, currentPrice, atr } = ind;

    if (isNaN(rsi) || isNaN(ema9) || isNaN(ema21) || isNaN(ema50)) return null;

    const trendAligned = ema9 > ema21 && ema21 > ema50;
    const rsiHealthy = rsi >= 42 && rsi <= 68;
    const volumeStrong = volumeRatio >= 1.8;
    const macdBullish = !isNaN(macdHistogram) && macdHistogram > 0 && macd > macdSignal;

    if (!trendAligned || !rsiHealthy) return null;

    let score = 50;
    if (volumeRatio >= 2) score += 15;
    else if (volumeRatio >= 1.8) score += 8;
    if (macdBullish) score += 15;
    if (rsi >= 50 && rsi <= 62) score += 10; // sweet spot
    if (ema9 / ema21 > 1.005) score += 5; // EMA separation confirms momentum
    if (volumeStrong && macdBullish) score += 5; // bonus for confluence

    const catalysts: string[] = [];
    if (volumeRatio >= 2) catalysts.push(`High relative volume (${volumeRatio.toFixed(1)}×)`);
    if (macdBullish) catalysts.push('MACD bullish crossover');
    if (trendAligned) catalysts.push('EMA9 > EMA21 > EMA50 trend aligned');
    catalysts.push(`RSI ${rsi.toFixed(0)} — healthy momentum zone`);

    const { stopLoss, takeProfit } = stopAndTarget(currentPrice, atr || currentPrice * 0.015, 'BUY');

    return {
        strategy: 'MOMENTUM',
        direction: 'BUY',
        strength: clamp(score),
        entryLow: +(currentPrice * 0.999).toFixed(4),
        entryHigh: +(currentPrice * 1.003).toFixed(4),
        stopLoss,
        takeProfit,
        catalysts,
    };
}

// ─── 2. GAP-AND-GO ─────────────────────────────────────────────────────────────
/**
 * Plays stocks that gap up on open with a news catalyst.
 * Entry: first 5-min pullback after gap.
 * Target: gap extension or +8%, stop at gap fill.
 */
export function scoreGap(ind: IndicatorSummary): StrategySignal | null {
    const { gapPercent, volumeRatio, rsi, currentPrice, atr } = ind;

    if (isNaN(gapPercent) || Math.abs(gapPercent) < 2) return null;

    const isGapUp = gapPercent > 0;
    if (!isGapUp) return null; // Only long side for $50 budget (no shorting on WS)

    if (volumeRatio < 2) return null; // Gaps without volume fail

    let score = 55;
    if (gapPercent >= 5) score += 20;
    else if (gapPercent >= 3) score += 12;
    if (volumeRatio >= 3) score += 15;
    else if (volumeRatio >= 2) score += 8;
    if (rsi >= 50 && rsi <= 75) score += 10; // not immediately overbought

    const catalysts: string[] = [
        `Gap up ${gapPercent.toFixed(1)}% on open`,
        `Volume ${volumeRatio.toFixed(1)}× above average`,
    ];
    if (rsi < 70) catalysts.push('RSI not yet overbought — extension likely');

    const { stopLoss, takeProfit } = stopAndTarget(currentPrice, atr || currentPrice * 0.02, 'BUY', 1.2, 3);

    return {
        strategy: 'GAP',
        direction: 'BUY',
        strength: clamp(score),
        entryLow: +(currentPrice * 0.997).toFixed(4),
        entryHigh: +(currentPrice * 1.005).toFixed(4),
        stopLoss,
        takeProfit,
        catalysts,
    };
}

// ─── 3. BREAKOUT ────────────────────────────────────────────────────────────────
/**
 * Buys a break above the 20-day high after a Bollinger Band squeeze.
 * High win-rate when price closes above resistance with volume.
 */
export function scoreBreakout(ind: IndicatorSummary): StrategySignal | null {
    const { currentPrice, high20d, bbBandwidth, volumeRatio, rsi, atr } = ind;

    if (isNaN(high20d) || isNaN(bbBandwidth)) return null;

    const isBreaking = currentPrice >= high20d * 0.998; // within 0.2% of 20d high
    const wasSqueezing = bbBandwidth < 0.06; // tight bands = coiled energy
    const volumeConfirms = volumeRatio >= 1.5;
    const rsiOk = rsi >= 45 && rsi <= 75;

    if (!isBreaking || !volumeConfirms || !rsiOk) return null;

    let score = 55;
    if (currentPrice > high20d) score += 15; // actual breakout (not just near)
    if (wasSqueezing) score += 15;
    if (volumeRatio >= 2) score += 10;
    if (rsi >= 55 && rsi <= 68) score += 5;

    const catalysts: string[] = [
        `Breaking above 20-day high ($${high20d.toFixed(2)})`,
        `Volume ${volumeRatio.toFixed(1)}× confirms breakout`,
    ];
    if (wasSqueezing) catalysts.push('Bollinger Band squeeze — compressed volatility releasing');

    const { stopLoss, takeProfit } = stopAndTarget(currentPrice, atr || currentPrice * 0.015, 'BUY', 1.5, 3);

    return {
        strategy: 'BREAKOUT',
        direction: 'BUY',
        strength: clamp(score),
        entryLow: +(high20d * 0.999).toFixed(4),
        entryHigh: +(currentPrice * 1.004).toFixed(4),
        stopLoss,
        takeProfit,
        catalysts,
    };
}

// ─── 4. MEAN REVERSION (Oversold Bounce) ────────────────────────────────────────
/**
 * Buys deeply oversold large-caps near Bollinger lower band.
 * Only for quality names — no speculative plays here.
 * Target: revert to the mean (+4-6%), tight stop -2%.
 */
export function scoreMeanReversion(ind: IndicatorSummary): StrategySignal | null {
    const { rsi, bbPercentB, currentPrice, bbLower, atr, volumeRatio } = ind;

    if (isNaN(rsi) || isNaN(bbPercentB)) return null;

    const oversold = rsi <= 32;
    const nearLowerBand = bbPercentB <= 0.15; // price within 15% of lower band range
    const volumeNormal = volumeRatio < 4; // extreme volume = panic, avoid

    if (!oversold || !nearLowerBand || !volumeNormal) return null;

    let score = 52;
    if (rsi <= 25) score += 15;
    else if (rsi <= 30) score += 8;
    if (bbPercentB <= 0.05) score += 12; // touching lower band
    if (volumeRatio >= 1.5) score += 5; // bounce volume starting
    const distFromLower = bbLower ? Math.abs((currentPrice - bbLower) / bbLower) : 1;
    if (distFromLower < 0.01) score += 8; // very close to lower band

    const catalysts: string[] = [
        `RSI ${rsi.toFixed(0)} — deeply oversold`,
        `Price near Bollinger lower band (${(bbPercentB * 100).toFixed(0)}%B)`,
        'Mean reversion setup — high R:R bounce play',
    ];

    const { stopLoss, takeProfit } = stopAndTarget(currentPrice, atr || currentPrice * 0.012, 'BUY', 1.2, 3);

    return {
        strategy: 'MEAN_REVERSION',
        direction: 'BUY',
        strength: clamp(score),
        entryLow: +(currentPrice * 0.999).toFixed(4),
        entryHigh: +(currentPrice * 1.002).toFixed(4),
        stopLoss,
        takeProfit,
        catalysts,
    };
}

// ─── All strategies runner ────────────────────────────────────────────────────

/**
 * Run all strategies against an indicator snapshot.
 * Returns all signals with strength >= minStrength, sorted by strength desc.
 */
export function runAllStrategies(
    ind: IndicatorSummary,
    minStrength = 50
): StrategySignal[] {
    const candidates = [
        scoreМomentum(ind),
        scoreGap(ind),
        scoreBreakout(ind),
        scoreMeanReversion(ind),
    ].filter((s): s is StrategySignal => s !== null && s.strength >= minStrength);

    return candidates.sort((a, b) => b.strength - a.strength);
}
