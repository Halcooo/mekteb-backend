"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPushPass = runPushPass;
async function runPushPass(processBatch, options = {}) {
    const { maxBatches = 20, budgetMs = 45000, now = Date.now, stopped = () => false } = options;
    if (!Number.isInteger(maxBatches) || maxBatches < 1 || budgetMs < 1)
        throw new Error('Invalid push pass bounds');
    const deadline = now() + budgetMs;
    let batches = 0, claimed = 0;
    while (batches < maxBatches && now() < deadline && !stopped()) {
        const count = await processBatch();
        batches++;
        claimed += count;
        if (count === 0)
            break;
    }
    return { batches, claimed };
}
