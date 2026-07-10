import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const galleryDir = path.resolve(__dirname, '..');
const landingDir = path.resolve(galleryDir, process.env.LANDING_DIR || '../landing');
const strict =
  process.env.REQUIRE_LANDING_SITEMAP_REFRESH === 'true' ||
  (process.env.REQUIRE_LANDING_SITEMAP_REFRESH !== 'false' &&
    (process.env.VERCEL === '1' || process.env.CI === 'true'));
const landingPackageJson = path.join(landingDir, 'package.json');

if (!existsSync(landingPackageJson)) {
  const message = `[refresh-landing-blog-sitemap] Landing project not found at ${landingDir}; skipping sitemap refresh.`;
  if (strict) {
    console.error(`${message} Set LANDING_DIR or disable REQUIRE_LANDING_SITEMAP_REFRESH.`);
    process.exit(1);
  }

  console.warn(message);
  process.exit(0);
}

console.log(`[refresh-landing-blog-sitemap] Refreshing landing sitemap in ${landingDir}`);

const result = spawnSync('npm', ['run', 'generate:sitemap'], {
  cwd: landingDir,
  env: {
    ...process.env,
    NODE_ENV: 'production',
  },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

if (result.error) {
  console.error(`[refresh-landing-blog-sitemap] ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
