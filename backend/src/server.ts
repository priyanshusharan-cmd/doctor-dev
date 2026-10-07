import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createApp } from './app';

dotenv.config();

const frontendDirectory = path.resolve(__dirname, '../../frontend/dist');
if (process.env.NODE_ENV === 'production' && !existsSync(path.join(frontendDirectory, 'index.html'))) {
  throw new Error('Frontend build missing. Run npm run build from the repository root before starting.');
}

const app = createApp(frontendDirectory);
const port = parseInt(process.env.PORT ?? '3001', 10);
app.listen(port, '0.0.0.0', () => {
  process.stdout.write(`${JSON.stringify({ service: 'doctor-dev', event: 'listening', port })}\n`);
});

export default app;
