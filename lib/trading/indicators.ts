/**
 * Technical Indicators — pure TypeScript, zero external dependencies.
 * All functions operate on arrays of numbers (close prices, OHLCV, etc.)
 * following the same conventions as TradingView's Pine Script indicators.
 */

export interface OHLCV {
    o: number; // open
    h: number; // high
    l: number; // low
    c: number; // close
    v: number; // volume
    t: number; // unix timestamp (seconds)
}

// ─── Simple Moving Average ────────────────────────────────────────────────────

export function sma(values: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < values.length; i++) {
        if (i < period - 1) {
            result.push(NaN);
            continue;
        }
        const slice = values.slice(i - period + 1, i + 1);
        result.push(slice.reduce((a, b) => a + b, 0) / period);
    }
    return result;
}

// ─── Exponential Moving Average ──────────────────────────────────────────────

export function ema(values: number[], period: number): number[] {
    const result: number[] = [];
    const k = 2 / (period + 1);
    let prev = NaN;

    for (let i = 0; i < values.length; i++) {
        if (i < period - 1) {
            result.push(NaN);
            continue;
        }
        if (i === period - 1) {
            // Seed with SMA
            const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
            prev = seed;
            result.push(seed);
            continue;
        }
        prev = values[i] * k + prev * (1 - k);
        result.push(prev);
    }
    return result;
}

/** Returns the last computed EMA value (most recent). */
export function emaLast(values: number[], period: number): number {
    const arr = ema(values, period);
    return arr[arr.length - 1];
}

// ─── RSI ─────────────────────────────────────────────────────────────────────

export function rsi(closes: number[], period = 14): number[] {
    const result: number[] = new Array(closes.length).fill(NaN);
    if (closes.length < period + 1) return result;

    // Initial average gain/loss (Wilder's smoothing)
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) avgGain += diff;
        else avgLoss += Math.abs(diff);
    }
    avgGain /= period;
    avgLoss /= period;

    const rs0 = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs0);

    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? Math.abs(diff) : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
        result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    }
    return result;
}

export function rsiLast(closes: number[], period = 14): number {
    const arr = rsi(closes, period);
    return arr[arr.length - 1];
}

// ─── MACD ─────────────────────────────────────────────────────────────────────

export interface MACDResult {
    macd: number[];
    signal: number[];
    histogram: number[];
}

export function macd(
    closes: number[],
    fast = 12,
    slow = 26,
    signal = 9
): MACDResult {
    const emaFast = ema(closes, fast);
    const emaSlow = ema(closes, slow);

    const macdLine = emaFast.map((v, i) =>
        isNaN(v) || isNaN(emaSlow[i]) ? NaN : v - emaSlow[i]
    );

    // Signal is EMA of MACD line (skip NaNs)
    const validMacd = macdLine.filter((v) => !isNaN(v));
    const signalFull = ema(validMacd, signal);

    // Re-align signal back to original array length
    const offset = macdLine.findIndex((v) => !isNaN(v));
    const signalLine: number[] = new Array(closes.length).fill(NaN);
    for (let i = 0; i < signalFull.length; i++) {
        signalLine[offset + i] = signalFull[i];
    }

    const histogram = macdLine.map((v, i) =>
        isNaN(v) || isNaN(signalLine[i]) ? NaN : v - signalLine[i]
    );

    return { macd: macdLine, signal: signalLine, histogram };
}

export function macdLast(closes: number[], fast = 12, slow = 26, sig = 9) {
    const r = macd(closes, fast, slow, sig);
    const last = closes.length - 1;
    return {
        macd: r.macd[last],
        signal: r.signal[last],
        histogram: r.histogram[last],
    };
}

// ─── Bollinger Bands ─────────────────────────────────────────────────────────

export interface BBResult {
    upper: number[];
    middle: number[];
    lower: number[];
    bandwidth: number[]; // (upper - lower) / middle
}

export function bollingerBands(closes: number[], period = 20, stdDev = 2): BBResult {
    const middle = sma(closes, period);
    const upper: number[] = [];
    const lower: number[] = [];
    const bandwidth: number[] = [];

    for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) {
            upper.push(NaN);
            lower.push(NaN);
            bandwidth.push(NaN);
            continue;
        }
        const slice = closes.slice(i - period + 1, i + 1);
        const mean = middle[i];
        const variance = slice.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / period;
        const sd = Math.sqrt(variance);
        upper.push(mean + stdDev * sd);
        lower.push(mean - stdDev * sd);
        bandwidth.push(mean > 0 ? (stdDev * 2 * sd) / mean : NaN);
    }
    return { upper, middle, lower, bandwidth };
}

export function bbLast(closes: number[], period = 20, stdDev = 2) {
    const r = bollingerBands(closes, period, stdDev);
    const last = closes.length - 1;
    return {
        upper: r.upper[last],
        middle: r.middle[last],
        lower: r.lower[last],
        bandwidth: r.bandwidth[last],
        percentB: r.upper[last] && r.lower[last]
            ? (closes[last] - r.lower[last]) / (r.upper[last] - r.lower[last])
            : NaN,
    };
}

// ─── ATR (Average True Range) ─────────────────────────────────────────────────

export function atr(candles: OHLCV[], period = 14): number[] {
    const trueRanges: number[] = [];

    for (let i = 0; i < candles.length; i++) {
        if (i === 0) {
            trueRanges.push(candles[i].h - candles[i].l);
            continue;
        }
        const prevClose = candles[i - 1].c;
        const tr = Math.max(
            candles[i].h - candles[i].l,
            Math.abs(candles[i].h - prevClose),
            Math.abs(candles[i].l - prevClose)
        );
        trueRanges.push(tr);
    }

    const result: number[] = new Array(candles.length).fill(NaN);
    if (trueRanges.length < period) return result;

    // Wilder's smoothing
    let atrVal = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result[period - 1] = atrVal;
    for (let i = period; i < trueRanges.length; i++) {
        atrVal = (atrVal * (period - 1) + trueRanges[i]) / period;
        result[i] = atrVal;
    }
    return result;
}

export function atrLast(candles: OHLCV[], period = 14): number {
    const arr = atr(candles, period);
    return arr[arr.length - 1];
}

// ─── Volume Ratio ─────────────────────────────────────────────────────────────

/**
 * Returns (current volume) / (average volume over period).
 * >2 = high relative volume (a key momentum filter).
 */
export function volumeRatio(candles: OHLCV[], period = 20): number {
    if (candles.length < period + 1) return 1;
    const current = candles[candles.length - 1].v;
    const avgVol =
        candles
            .slice(candles.length - 1 - period, candles.length - 1)
            .reduce((a, c) => a + c.v, 0) / period;
    return avgVol === 0 ? 1 : current / avgVol;
}

// ─── Gap Percent ──────────────────────────────────────────────────────────────

/**
 * Returns the overnight gap from yesterday's close to today's open (%).
 * Positive = gap up, negative = gap down.
 */
export function gapPercent(candles: OHLCV[]): number {
    if (candles.length < 2) return 0;
    const prevClose = candles[candles.length - 2].c;
    const todayOpen = candles[candles.length - 1].o;
    return prevClose === 0 ? 0 : ((todayOpen - prevClose) / prevClose) * 100;
}

// ─── Highest / Lowest ─────────────────────────────────────────────────────────

export function highestHigh(candles: OHLCV[], period: number): number {
    const slice = candles.slice(-period);
    return Math.max(...slice.map((c) => c.h));
}

export function lowestLow(candles: OHLCV[], period: number): number {
    const slice = candles.slice(-period);
    return Math.min(...slice.map((c) => c.l));
}

// ─── Composite Indicator Summary ─────────────────────────────────────────────

export interface IndicatorSummary {
    rsi: number;
    ema9: number;
    ema21: number;
    ema50: number;
    macd: number;
    macdSignal: number;
    macdHistogram: number;
    bbUpper: number;
    bbMiddle: number;
    bbLower: number;
    bbBandwidth: number;
    bbPercentB: number;
    atr: number;
    volumeRatio: number;
    gapPercent: number;
    high20d: number;
    low20d: number;
    currentPrice: number;
}

export function computeIndicators(candles: OHLCV[]): IndicatorSummary {
    const closes = candles.map((c) => c.c);
    const m = macdLast(closes);
    const bb = bbLast(closes);

    return {
        rsi: rsiLast(closes),
        ema9: emaLast(closes, 9),
        ema21: emaLast(closes, 21),
        ema50: emaLast(closes, 50),
        macd: m.macd,
        macdSignal: m.signal,
        macdHistogram: m.histogram,
        bbUpper: bb.upper,
        bbMiddle: bb.middle,
        bbLower: bb.lower,
        bbBandwidth: bb.bandwidth,
        bbPercentB: bb.percentB,
        atr: atrLast(candles),
        volumeRatio: volumeRatio(candles),
        gapPercent: gapPercent(candles),
        high20d: highestHigh(candles, 20),
        low20d: lowestLow(candles, 20),
        currentPrice: closes[closes.length - 1],
    };
}
