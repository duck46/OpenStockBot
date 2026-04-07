/**
 * Scanner — orchestrates the full signal-generation pipeline.
 *
 * Flow:
 *   1. For each symbol in the trading universe, fetch daily + intraday candles
 *   2. Compute all technical indicators
 *   3. Run all 4 strategies — collect signals with strength >= 50
 *   4. Run AI analysis on the top 5 signals (API cost control)
 *   5. Save final signals to MongoDB (TradingSignal collection, 30-min TTL)
 *   6. Return all signals sorted by adjusted strength
 */

import { getDailyCandles, getIntradayCandles, getNews } from '@/lib/actions/finnhub.actions';
import { computeIndicators } from './indicators';
import { runAllStrategies } from './strategies';
import { analyzeSignal } from './ai-analyst';
import { sizeFromStrength, MAX_POSITION_CAD } from './risk-manager';

// ─── Trading Universe ─────────────────────────────────────────────────────────
// High-liquidity, high-volatility stocks available on Wealthsimple Trade
// Overridable via env var TRADING_UNIVERSE (comma-separated)

const DEFAULT_UNIVERSE = [
    // US Large-cap tech & growth — high volatility, liquid options
    'AAPL', 'TSLA', 'NVDA', 'AMD', 'META', 'AMZN', 'MSFT', 'GOOGL', 'NFLX',
    // Crypto proxies & high-beta growth
    'COIN', 'MSTR', 'PLTR', 'SOFI', 'RIVN', 'NIO',
    // Canadian stocks (available on Wealthsimple, TSX-listed)
    'SHOP',   // Shopify — USD-listed, high liquidity
    // Sector ETFs for broad momentum plays
    'SPY', 'QQQ', 'SOXS', 'ARKK',
];

export function getTradingUniverse(): string[] {
    const envUniverse = process.env.TRADING_UNIVERSE;
    if (envUniverse) {
        return envUniverse.split(',').map((s: string) => s.trim().toUpperCase()).filter((s: string): s is string => Boolean(s));
    }
    return DEFAULT_UNIVERSE;
}

// ─── Single-symbol scan ───────────────────────────────────────────────────────

export interface ScanResult {
    symbol: string;
    indicators: ReturnType<typeof computeIndicators>;
    signals: ReturnType<typeof runAllStrategies>;
}

async function scanSymbol(symbol: string): Promise<ScanResult | null> {
    try {
        // Fetch daily candles for trend + 20d high/low, then intraday for momentum
        const [daily, intraday] = await Promise.all([
            getDailyCandles(symbol, 60),
            getIntradayCandles(symbol, 7),
        ]);

        // Need at least 50 daily candles for EMA50 and 20d high
        if (daily.length < 50) return null;

        // Use intraday candles if available (better for gap + volume ratio),
        // fall back to daily if market hasn't opened yet
        const candles = intraday.length >= 10 ? intraday : daily;

        // Indicators need at least 26 candles for MACD slow period
        if (candles.length < 26) return null;

        // Compute indicators from intraday (current session awareness)
        // but override gapPercent and high20d from daily
        const intradayInd = computeIndicators(candles);
        const dailyInd = computeIndicators(daily);

        const indicators = {
            ...intradayInd,
            // Use daily values for multi-day indicators
            ema50: dailyInd.ema50,
            high20d: dailyInd.high20d,
            low20d: dailyInd.low20d,
            gapPercent: dailyInd.gapPercent,
        };

        const signals = runAllStrategies(indicators);
        return { symbol, indicators, signals };
    } catch (err) {
        console.error(`Scanner error for ${symbol}:`, err);
        return null;
    }
}

// ─── Full scan + AI enrichment ────────────────────────────────────────────────

export interface EnrichedSignal {
    symbol: string;
    strategy: string;
    direction: 'BUY' | 'SELL';
    strength: number;
    adjustedStrength: number;
    currentPrice: number;
    entryLow: number;
    entryHigh: number;
    stopLoss: number;
    takeProfit: number;
    suggestedAllocCAD: number;
    reasoning: string;
    riskFlags: string[];
    catalysts: string[];
    indicators: {
        rsi?: number;
        macd?: number;
        macdSignal?: number;
        ema9?: number;
        ema21?: number;
        bbUpper?: number;
        bbLower?: number;
        atr?: number;
        volumeRatio?: number;
        gapPercent?: number;
    };
}

export async function runFullScan(minStrength = 50): Promise<EnrichedSignal[]> {
    const universe = getTradingUniverse();

    // Scan all symbols in parallel (rate-limit friendly — Finnhub free tier: 60 req/min)
    // Process in batches of 10 to avoid hammering the API
    const BATCH_SIZE = 10;
    const allResults: ScanResult[] = [];

    for (let i = 0; i < universe.length; i += BATCH_SIZE) {
        const batch = universe.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(scanSymbol));
        allResults.push(...batchResults.filter((r): r is ScanResult => r !== null));
    }

    // Collect all signals above threshold
    const candidateSignals: Array<{ symbol: string; signal: ReturnType<typeof runAllStrategies>[0]; indicators: ScanResult['indicators'] }> = [];

    for (const result of allResults) {
        for (const signal of result.signals) {
            if (signal.strength >= minStrength) {
                candidateSignals.push({
                    symbol: result.symbol,
                    signal,
                    indicators: result.indicators,
                });
            }
        }
    }

    if (candidateSignals.length === 0) return [];

    // Sort by strength, take top 10 max for AI enrichment
    candidateSignals.sort((a, b) => b.signal.strength - a.signal.strength);
    const topCandidates = candidateSignals.slice(0, 10);

    // Fetch news for context (shared across all signals to save API calls)
    const symbols = [...new Set(topCandidates.map((c) => c.symbol))];
    let newsArticles: { headline: string; summary?: string }[] = [];
    try {
        const articles = await getNews(symbols.slice(0, 5)); // top 5 symbols
        newsArticles = articles.map((a) => ({
            headline: a.headline,
            summary: a.summary,
        }));
    } catch {
        // News fetch failure is non-critical
    }

    // Run AI analysis on top 5 only (cost control)
    const AI_ANALYSIS_LIMIT = 5;
    const enriched: EnrichedSignal[] = [];

    for (let i = 0; i < topCandidates.length; i++) {
        const { symbol, signal, indicators } = topCandidates[i];

        let reasoning = signal.catalysts.join('. ');
        let riskFlags: string[] = [];
        let adjustedStrength = signal.strength;

        if (i < AI_ANALYSIS_LIMIT) {
            try {
                const analysis = await analyzeSignal(symbol, signal, indicators, newsArticles);
                reasoning = analysis.reasoning;
                riskFlags = analysis.riskFlags;
                adjustedStrength = analysis.adjustedStrength;
            } catch {
                // keep technical defaults
            }
        }

        const remainingBudget = MAX_POSITION_CAD; // scanner doesn't know current budget state
        enriched.push({
            symbol,
            strategy: signal.strategy,
            direction: signal.direction,
            strength: signal.strength,
            adjustedStrength,
            currentPrice: indicators.currentPrice,
            entryLow: signal.entryLow,
            entryHigh: signal.entryHigh,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            suggestedAllocCAD: sizeFromStrength(adjustedStrength, remainingBudget),
            reasoning,
            riskFlags,
            catalysts: signal.catalysts,
            indicators: {
                rsi: indicators.rsi,
                macd: indicators.macd,
                macdSignal: indicators.macdSignal,
                ema9: indicators.ema9,
                ema21: indicators.ema21,
                bbUpper: indicators.bbUpper,
                bbLower: indicators.bbLower,
                atr: indicators.atr,
                volumeRatio: indicators.volumeRatio,
                gapPercent: indicators.gapPercent,
            },
        });
    }

    return enriched.sort((a, b) => b.adjustedStrength - a.adjustedStrength);
}

// ─── Save signals to MongoDB ──────────────────────────────────────────────────

export async function persistSignals(signals: EnrichedSignal[]): Promise<void> {
    const { connectToDatabase } = await import('@/database/mongoose');
    const { TradingSignal } = await import('@/database/models/trading-signal.model');

    await connectToDatabase();

    // Delete expired / old signals before inserting fresh ones
    await TradingSignal.deleteMany({ expiresAt: { $lt: new Date() } });

    const docs = signals.map((s) => ({
        symbol: s.symbol,
        strategy: s.strategy,
        direction: s.direction,
        strength: s.adjustedStrength,
        currentPrice: s.currentPrice,
        entryLow: s.entryLow,
        entryHigh: s.entryHigh,
        stopLoss: s.stopLoss,
        takeProfit: s.takeProfit,
        suggestedAllocCAD: s.suggestedAllocCAD,
        reasoning: s.reasoning,
        catalysts: s.catalysts,
        indicators: s.indicators,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min TTL
        generatedAt: new Date(),
    }));

    await TradingSignal.insertMany(docs);
}
