#!/usr/bin/env node

const os = require('os');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

const localIP = getLocalIP();
const port = process.env.PORT || 3000;

// Start Next.js dev server and intercept output to replace 0.0.0.0 with actual IP
const { spawn } = require('child_process');
const nextProcess = spawn('npx', ['next', 'dev', '--hostname', '0.0.0.0'], {
  stdio: ['inherit', 'pipe', 'pipe'],
});

// Replace 0.0.0.0 with actual IP in Next.js output
function replaceIPInOutput(data) {
  const output = data.toString();
  if (localIP) {
    // Replace http://0.0.0.0:PORT with actual IP
    const replaced = output.replace(/0\.0\.0\.0/g, localIP);
    process.stdout.write(replaced);
  } else {
    process.stdout.write(output);
  }
}

nextProcess.stdout.on('data', replaceIPInOutput);
nextProcess.stderr.on('data', replaceIPInOutput);

nextProcess.on('exit', (code) => {
  process.exit(code);
});

