"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const analysisRoutes_1 = require("./routes/analysisRoutes");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT ?? '3001', 10);
// ─── Middleware ───────────────────────────────────────────────────────────────
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type'],
}));
app.use(express_1.default.json());
// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'doctor-dev',
        version: '0.2.0',
        timestamp: new Date().toISOString(),
    });
});
// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', analysisRoutes_1.analysisRouter);
// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
});
// ─── Error handler ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err, _req, res, _next) => {
    console.error('[doctor-dev]', err.message);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
});
// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`[doctor-dev] Backend running at http://localhost:${PORT}`);
    console.log(`[doctor-dev] Health:   GET  http://localhost:${PORT}/api/health`);
    console.log(`[doctor-dev] Analyze:  POST http://localhost:${PORT}/api/analyze`);
    console.log(`[doctor-dev] Result:   GET  http://localhost:${PORT}/api/analysis/:id`);
});
exports.default = app;
//# sourceMappingURL=server.js.map