import fs from 'node:fs';
import path from 'node:path';
import SamsarClient from 'samsar-js';

const productionEnvPath = path.resolve(process.cwd(), '.env.production');
if (fs.existsSync(productionEnvPath)) {
  const content = fs.readFileSync(productionEnvPath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const normalized = line.trim();
    if (!normalized || normalized.startsWith('#')) return;
    const separator = normalized.indexOf('=');
    if (separator <= 0) return;
    const key = normalized.slice(0, separator).trim();
    const value = normalized.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  });
}

const apiKey = process.env.SAMSAR_API_KEY?.trim();
if (!apiKey) {
  console.warn('[gallery-sync] SAMSAR_API_KEY is not configured; deployment sync skipped.');
  process.exit(0);
}

const client = new SamsarClient({
  apiKey,
  baseUrl: 'https://api.samsar.one/v1',
  timeoutMs: 240000,
});

try {
  const result = await client.postV2('gallery/sync', { force: false });
  const data = result.data || {};
  console.log(
    `[gallery-sync] ${data.status || 'complete'}: indexed ${data.indexed || 0}, skipped ${data.skipped || 0}.`,
  );
} catch (error) {
  // The secured hourly cron retries synchronization after deployment. Do not fail a frontend
  // deployment because the processor is temporarily unavailable or deploying concurrently.
  console.warn(`[gallery-sync] Deployment sync deferred: ${error?.message || error}`);
}
