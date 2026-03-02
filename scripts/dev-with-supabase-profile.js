#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const REQUIRED_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

function parseEnvFile(contents) {
  const result = {};
  const lines = contents.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    let value = match[2] || '';

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function run() {
  const profile = process.argv[2];

  if (!profile) {
    console.error('Usage: node scripts/dev-with-supabase-profile.js <profile>');
    console.error('Example: npm run dev:main');
    process.exit(1);
  }

  const envPath = path.resolve(process.cwd(), `.env.supabase.${profile}`);

  if (!fs.existsSync(envPath)) {
    console.error(`Missing profile file: ${envPath}`);
    console.error('Create it from .env.supabase.example and fill in branch credentials.');
    process.exit(1);
  }

  const fileContents = fs.readFileSync(envPath, 'utf8');
  const profileEnv = parseEnvFile(fileContents);
  const mergedEnv = {
    ...process.env,
    ...profileEnv,
  };

  const missing = REQUIRED_KEYS.filter((key) => !mergedEnv[key]);
  if (missing.length > 0) {
    console.error(`Profile ${profile} is missing required keys: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log(`Using Supabase profile: ${profile} (${envPath})`);

  const devScriptPath = path.resolve(__dirname, 'dev-with-ip.js');
  const child = spawn(process.execPath, [devScriptPath], {
    stdio: 'inherit',
    env: mergedEnv,
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

run();
