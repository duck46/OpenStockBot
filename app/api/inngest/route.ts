import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import {
    sendWeeklyNewsSummary,
    sendSignUpEmail,
    checkStockAlerts,
    checkInactiveUsers,
    preMarketScan,
    intradaySignalScan,
    dailyTradingRecap,
} from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [
        sendSignUpEmail,
        sendWeeklyNewsSummary,
        checkStockAlerts,
        checkInactiveUsers,
        preMarketScan,
        intradaySignalScan,
        dailyTradingRecap,
    ],
})