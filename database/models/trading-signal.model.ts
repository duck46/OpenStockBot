import { Schema, model, models, type Document, type Model } from 'mongoose';

export interface ITradingSignal extends Document {
    symbol: string;
    strategy: 'MOMENTUM' | 'GAP' | 'BREAKOUT' | 'MEAN_REVERSION';
    direction: 'BUY' | 'SELL';
    strength: number; // 0-100
    currentPrice: number;
    entryLow: number;
    entryHigh: number;
    stopLoss: number;
    takeProfit: number;
    suggestedAllocCAD: number;
    reasoning: string;
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
    expiresAt: Date;
    generatedAt: Date;
}

const TradingSignalSchema = new Schema<ITradingSignal>(
    {
        symbol: { type: String, required: true, uppercase: true, trim: true, index: true },
        strategy: {
            type: String,
            enum: ['MOMENTUM', 'GAP', 'BREAKOUT', 'MEAN_REVERSION'],
            required: true,
        },
        direction: { type: String, enum: ['BUY', 'SELL'], required: true },
        strength: { type: Number, required: true, min: 0, max: 100 },
        currentPrice: { type: Number, required: true },
        entryLow: { type: Number, required: true },
        entryHigh: { type: Number, required: true },
        stopLoss: { type: Number, required: true },
        takeProfit: { type: Number, required: true },
        suggestedAllocCAD: { type: Number, required: true },
        reasoning: { type: String, required: true },
        catalysts: [{ type: String }],
        indicators: {
            rsi: Number,
            macd: Number,
            macdSignal: Number,
            ema9: Number,
            ema21: Number,
            bbUpper: Number,
            bbLower: Number,
            atr: Number,
            volumeRatio: Number,
            gapPercent: Number,
        },
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
            index: { expires: 0 }, // TTL index: auto-delete when expired
        },
        generatedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

export const TradingSignal: Model<ITradingSignal> =
    (models?.TradingSignal as Model<ITradingSignal>) ||
    model<ITradingSignal>('TradingSignal', TradingSignalSchema);
