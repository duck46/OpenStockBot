/**
 * AI Analyst — uses the existing multi-provider LLM to enrich trading signals
 * with plain-English reasoning, risk flags, and conviction scoring.
 *
 * Written to mirror 20 years of institutional trading intuition:
 * - Checks macro context from recent news
 * - Validates technical thesis with fundamentals
 * - Flags sector rotation, earnings risk, and liquidity concerns
 */

import { callAIProviderWithFallback } from '@/lib/ai-provider';
import type { IndicatorSummary } from './indicators';
import type { StrategySignal } from './strategies';

export interface AIAnalysis {
    reasoning: string;       // 2-3 sentence plain-English explanation
    riskFlags: string[];     // e.g. ["Earnings in 2 days", "Sector weak"]
    adjustedStrength: number; // AI may increase or decrease the technical score
}

const ANALYST_PROMPT = `You are a 20-year Wall Street veteran and day trader with deep experience in technical analysis, momentum trading, and risk management. You trade $50 CAD per day targeting 15-25% gains using tight risk controls.

Analyze this trading signal and provide your assessment:

SYMBOL: {{symbol}}
STRATEGY: {{strategy}}
DIRECTION: {{direction}}
TECHNICAL STRENGTH: {{strength}}/100
CURRENT PRICE: \${{price}}
ENTRY ZONE: \${{entryLow}} - \${{entryHigh}}
STOP LOSS: \${{stopLoss}} (Risk: {{riskPct}}%)
TAKE PROFIT: \${{takeProfit}} (Reward: {{rewardPct}}%)

TECHNICAL INDICATORS:
- RSI(14): {{rsi}}
- EMA9/21/50: {{ema9}} / {{ema21}} / {{ema50}}
- MACD: {{macd}} | Signal: {{macdSignal}} | Histogram: {{histogram}}
- Bollinger %B: {{bbPctB}} | Bandwidth: {{bbBandwidth}}
- ATR(14): {{atr}}
- Volume Ratio: {{volRatio}}x vs 20-day avg
- Gap: {{gap}}%

CATALYSTS: {{catalysts}}

RECENT NEWS CONTEXT:
{{newsContext}}

Respond in this exact JSON format (no markdown, just JSON):
{
  "reasoning": "2-3 sentence professional analysis of why this trade makes sense right now, referencing specific indicators and price action",
  "riskFlags": ["list", "of", "specific", "risks"],
  "adjustedStrength": <integer 0-100>,
  "verdict": "STRONG_BUY | BUY | HOLD | SKIP"
}

Be concise, specific, and honest. If the setup is marginal, say so. Risk first, profit second.`;

export async function analyzeSignal(
    symbol: string,
    signal: StrategySignal,
    indicators: IndicatorSummary,
    recentNews: { headline: string; summary?: string }[] = []
): Promise<AIAnalysis> {
    const riskAmt = Math.abs(signal.entryHigh - signal.stopLoss);
    const rewardAmt = Math.abs(signal.takeProfit - signal.entryLow);
    const riskPct = ((riskAmt / signal.entryHigh) * 100).toFixed(1);
    const rewardPct = ((rewardAmt / signal.entryLow) * 100).toFixed(1);

    const newsContext = recentNews.length > 0
        ? recentNews
              .slice(0, 3)
              .map((n) => `• ${n.headline}${n.summary ? ': ' + n.summary.slice(0, 100) : ''}`)
              .join('\n')
        : 'No recent news available — technical setup only.';

    const prompt = ANALYST_PROMPT
        .replace('{{symbol}}', symbol)
        .replace('{{strategy}}', signal.strategy)
        .replace('{{direction}}', signal.direction)
        .replace('{{strength}}', signal.strength.toString())
        .replace('{{price}}', indicators.currentPrice.toFixed(2))
        .replace('{{entryLow}}', signal.entryLow.toFixed(2))
        .replace('{{entryHigh}}', signal.entryHigh.toFixed(2))
        .replace('{{stopLoss}}', signal.stopLoss.toFixed(2))
        .replace('{{takeProfit}}', signal.takeProfit.toFixed(2))
        .replace('{{riskPct}}', riskPct)
        .replace('{{rewardPct}}', rewardPct)
        .replace('{{rsi}}', isNaN(indicators.rsi) ? 'N/A' : indicators.rsi.toFixed(1))
        .replace('{{ema9}}', isNaN(indicators.ema9) ? 'N/A' : indicators.ema9.toFixed(2))
        .replace('{{ema21}}', isNaN(indicators.ema21) ? 'N/A' : indicators.ema21.toFixed(2))
        .replace('{{ema50}}', isNaN(indicators.ema50) ? 'N/A' : indicators.ema50.toFixed(2))
        .replace('{{macd}}', isNaN(indicators.macd) ? 'N/A' : indicators.macd.toFixed(4))
        .replace('{{macdSignal}}', isNaN(indicators.macdSignal) ? 'N/A' : indicators.macdSignal.toFixed(4))
        .replace('{{histogram}}', isNaN(indicators.macdHistogram) ? 'N/A' : indicators.macdHistogram.toFixed(4))
        .replace('{{bbPctB}}', isNaN(indicators.bbPercentB) ? 'N/A' : (indicators.bbPercentB * 100).toFixed(0) + '%')
        .replace('{{bbBandwidth}}', isNaN(indicators.bbBandwidth) ? 'N/A' : (indicators.bbBandwidth * 100).toFixed(1) + '%')
        .replace('{{atr}}', isNaN(indicators.atr) ? 'N/A' : indicators.atr.toFixed(3))
        .replace('{{volRatio}}', indicators.volumeRatio.toFixed(1))
        .replace('{{gap}}', indicators.gapPercent.toFixed(1))
        .replace('{{catalysts}}', signal.catalysts.join('; '))
        .replace('{{newsContext}}', newsContext);

    try {
        const raw = await callAIProviderWithFallback(prompt);

        // Strip markdown code fences if present
        const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(cleaned);

        return {
            reasoning: parsed.reasoning ?? 'Technical setup meets entry criteria.',
            riskFlags: Array.isArray(parsed.riskFlags) ? parsed.riskFlags : [],
            adjustedStrength: typeof parsed.adjustedStrength === 'number'
                ? Math.max(0, Math.min(100, parsed.adjustedStrength))
                : signal.strength,
        };
    } catch (err) {
        console.error(`AI analysis failed for ${symbol}:`, err);
        // Graceful fallback — return technical-only reasoning
        return {
            reasoning: `${symbol} ${signal.strategy} setup: ${signal.catalysts.join('. ')}. Entry $${signal.entryLow.toFixed(2)}-$${signal.entryHigh.toFixed(2)}, stop $${signal.stopLoss.toFixed(2)}, target $${signal.takeProfit.toFixed(2)}.`,
            riskFlags: ['AI analysis unavailable — review manually'],
            adjustedStrength: signal.strength,
        };
    }
}
