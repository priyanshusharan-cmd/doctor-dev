"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAnalysis = createAnalysis;
exports.getAnalysis = getAnalysis;
exports.listAnalyses = listAnalyses;
exports.setStatus = setStatus;
exports.setResult = setResult;
exports.setError = setError;
const uuid_1 = require("uuid");
const store = new Map();
function createAnalysis(repositoryPath) {
    const analysis = {
        id: (0, uuid_1.v4)(),
        status: 'pending',
        statusLabel: 'Waiting to start',
        repositoryPath,
        createdAt: new Date().toISOString(),
    };
    store.set(analysis.id, analysis);
    return analysis;
}
function getAnalysis(id) {
    return store.get(id);
}
function listAnalyses() {
    return Array.from(store.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
function setStatus(id, status, label) {
    const a = store.get(id);
    if (a) {
        a.status = status;
        if (label !== undefined)
            a.statusLabel = label;
    }
}
function setResult(id, result) {
    const a = store.get(id);
    if (!a)
        return;
    a.status = 'complete';
    a.statusLabel = 'Analysis complete';
    a.result = result;
    a.completedAt = new Date().toISOString();
}
function setError(id, error) {
    const a = store.get(id);
    if (!a)
        return;
    a.status = 'error';
    a.statusLabel = 'Analysis failed';
    a.error = error;
}
//# sourceMappingURL=analysisStore.js.map