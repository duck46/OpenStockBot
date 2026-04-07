import { Schema, model, models, type Document, type Model } from 'mongoose';

export interface ITrade extends Document {
    userId: string;
    symbol: string;
    strategy: 'MOMENTUM' | 'GAP' | 'BREAKOUT' | 'MEAN_REVERSION';
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    exitPrice?: number;
    quantity: number;
    allocatedCAD: number;
    stopLoss: number;
    takeProfit: number;
    status: 'OPEN' | 'CLOSED' | 'CANCELLED';
    pnlCAD?: number;
    pnlPercent?: number;
    signalStrength: number;
    notes?: string;
    openedAt: Date;
    closedAt?: Date;
}

const TradeSchema = new Schema<ITrade>(
    {
        userId: { type: String, required: true, index: true },
        symbol: { type: String, required: true, uppercase: true, trim: true },
        strategy: {
            type: String,
            enum: ['MOMENTUM', 'GAP', 'BREAKOUT', 'MEAN_REVERSION'],
            required: true,
        },
        direction: { type: String, enum: ['LONG', 'SHORT'], required: true },
        entryPrice: { type: Number, required: true },
        exitPrice: { type: Number },
        quantity: { type: Number, required: true },
        allocatedCAD: { type: Number, required: true },
        stopLoss: { type: Number, required: true },
        takeProfit: { type: Number, required: true },
        status: {
            type: String,
            enum: ['OPEN', 'CLOSED', 'CANCELLED'],
            default: 'OPEN',
            index: true,
        },
        pnlCAD: { type: Number },
        pnlPercent: { type: Number },
        signalStrength: { type: Number, required: true, min: 0, max: 100 },
        notes: { type: String },
        openedAt: { type: Date, default: Date.now },
        closedAt: { type: Date },
    },
    { timestamps: true }
);

export const Trade: Model<ITrade> =
    (models?.Trade as Model<ITrade>) || model<ITrade>('Trade', TradeSchema);
