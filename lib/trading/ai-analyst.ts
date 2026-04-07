/**
 * AI Analyst — uses the existing multi-provider LLM to enrich trading signals
 * with beginner-friendly plain-English reasoning and risk flags.
 *
 * Tone: patient, friendly guide for someone who has never traded before.
 * No jargon (RSI, MACD, EMA, Bollinger, etc.) — everyday language only.
 */

import { callAIProviderWithFallback } from '@/lib/ai-provider';
import type { IndicatorSummary } from './indicators';
import type { StrategySignal } from './strategies';

export interface AIAnalysis {
    reasoning: string;        // Plain-English "why" explanation for a beginner
    riskFlags: string[];      // Plain-English risks, e.g. "Earnings in 2 days — price could swing hard"
    adjustedStrength: number; // AI may increase or decrease the technical score
}

const ANALYST_PROMPT = `You are a friendly, patient guide helping a complete beginner understand a short-term trading opportunity. The person has never traded stocks before. Use simple everyday language — no finance jargon at all.

TRADE OPPORTUNITY:
- Stock: {{symbol}}
- What we want to do: Buy {{symbol}} and sell it for a quick profit today
- Suggested amount to spend: ${{allocCAD}} CAD
- Buy when price is around: ${{entryLow}} – ${{entryHigh}}
- Sell immediately for safety if price drops to: ${{stopLoss}} (you would lose about {{riskPct}}% of what you put in)
- Sell for profit when price reaches: ${{takeProfit}} (you would gain about {{rewardPct}}%)

WHY THE BOT FLAGGED THIS:
{{catalysts}}

RECENT NEWS ABOUT THIS STOCK:
{{newsContext}}

Respond ONLY with this exact JSON (no markdown, no explanation outside the JSON):
{
  "reasoning": "2-3 sentences explaining in simple everyday language WHY this stock is moving right now and why this might be a good short-term opportunity. Imagine explaining it to a friend who knows nothing about stocks. Example: 'Apple just released better-than-expected sales numbers and a lot of people are rushing to buy the stock. When many people buy at once, the price goes up quickly. This could be a short window to ride that wave before it settles down.'",
  "riskFlags": ["plain everyday-language risk — e.g. 'The company is announcing earnings in 2 days, which could cause the price to swing unpredictably'"],
  "adjustedStrength": <integer 0-100 — your overall confidence in this trade>
}

Rules you must follow:
- NEVER use these words: RSI, MACD, EMA, ATR, Bollinger, momentum, confluence, resistance, support, breakout, mean reversion, technical
- DO use phrases like: "rising fast", "falling", "a lot of people are buying right now", "news caused a jump", "the price has been stuck and just broke free", "risky because..."
- If the trade looks weak, be honest: "This is a lower-confidence trade — it might be better to wait for a stronger opportunity"
- riskFlags must be in plain language a beginner can understand — no acronyms`;

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
    // Estimated CAD allocation based on signal strength
    const allocCAD = signal.strength >= 80 ? '10.00' : signal.strength >= 60 ? '7.00' : '5.00';

    const newsContext = recentNews.length > 0
        ? recentNews
              .slice(0, 3)
              .map((n) => `• ${n.headline}${n.summary ? ': ' + n.summary.slice(0, 120) : ''}`)
              .join('\n')
        : 'No recent news found — this signal is based on price and volume patterns only.';

    const prompt = ANALYST_PROMPT
        .replace('{{symbol}}', symbol)
        .replace('{{allocCAD}}', allocCAD)
        .replace('{{entryLow}}', signal.entryLow.toFixed(2))
        .replace('{{entryHigh}}', signal.entryHigh.toFixed(2))
        .replace('{{stopLoss}}', signal.stopLoss.toFixed(2))
        .replace('{{takeProfit}}', signal.takeProfit.toFixed(2))
        .replace('{{riskPct}}', riskPct)
        .replace('{{rewardPct}}', rewardPct)
        .replace('{{catalysts}}', signal.catalysts.join('\n• '))
        .replace('{{newsContext}}', newsContext);

    try {
        const raw = await callAIProviderWithFallback(prompt);

        // Strip markdown code fences if present
        const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(cleaned);

        return {
            reasoning: parsed.reasoning ?? 'This stock is showing signs of short-term movement based on price and trading activity.',
            riskFlags: Array.isArray(parsed.riskFlags) ? parsed.riskFlags : [],
            adjustedStrength: typeof parsed.adjustedStrength === 'number'
                ? Math.max(0, Math.min(100, parsed.adjustedStrength))
                : signal.strength,
        };
    } catch (err) {
        console.error(`AI analysis failed for ${symbol}:`, err);
        // Plain-English fallback — no jargon
        const catalystText = signal.catalysts.length > 0
            ? signal.catalysts.join('. ')
            : 'price and volume patterns';
        return {
            reasoning: `${symbol} is showing activity based on ${catalystText}. The suggested buy range is $${signal.entryLow.toFixed(2)}–$${signal.entryHigh.toFixed(2)}, with a safety exit at $${signal.stopLoss.toFixed(2)} and a profit target of $${signal.takeProfit.toFixed(2)}.`,
            riskFlags: ['Could not generate a detailed explanation — review the catalysts above manually'],
            adjustedStrength: signal.strength,
        };
    }
}

