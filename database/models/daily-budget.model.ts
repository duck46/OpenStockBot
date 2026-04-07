import { Schema, model, models, type Document, type Model, Types } from 'mongoose';

export interface IDailyBudget extends Document {
    userId: string;
    date: string; // YYYY-MM-DD
    totalCAD: number;
    usedCAD: number;
    remainingCAD: number;
    realizedPnlCAD: number;
    unrealizedPnlCAD: number;
    tradeIds: Types.ObjectId[];
}

const DailyBudgetSchema = new Schema<IDailyBudget>(
    {
        userId: { type: String, required: true, index: true },
        date: { type: String, required: true }, // YYYY-MM-DD
        totalCAD: { type: Number, required: true, default: 50 },
        usedCAD: { type: Number, default: 0 },
        remainingCAD: { type: Number, default: 50 },
        realizedPnlCAD: { type: Number, default: 0 },
        unrealizedPnlCAD: { type: Number, default: 0 },
        tradeIds: [{ type: Schema.Types.ObjectId, ref: 'Trade' }],
    },
    { timestamps: true }
);

// One budget record per user per day
DailyBudgetSchema.index({ userId: 1, date: 1 }, { unique: true });

export const DailyBudget: Model<IDailyBudget> =
    (models?.DailyBudget as Model<IDailyBudget>) ||
    model<IDailyBudget>('DailyBudget', DailyBudgetSchema);
