#!/usr/bin/env node

const os = require("os");
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

const localIP = getLocalIP();
const requestedPort = Number(process.env.PORT || "3001");
if (
  !Number.isInteger(requestedPort) ||
  requestedPort < 1 ||
  requestedPort > 65535
) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}
const port = String(requestedPort);
const friendlyURL = process.env.DEV_URL || "http://gweilo.test";

function getLocalNginxExecutable() {
  const servicesDirectory = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "Local",
    "lightning-services",
  );
  if (!fs.existsSync(servicesDirectory)) return null;

  const architectureDirectory =
    process.arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  const versions = fs
    .readdirSync(servicesDirectory)
    .filter((entry) => entry.startsWith("nginx-"))
    .sort()
    .reverse();

  for (const version of versions) {
    const executable = path.join(
      servicesDirectory,
      version,
      "bin",
      architectureDirectory,
      "sbin",
      "nginx",
    );
    if (fs.existsSync(executable)) return executable;
  }

  return null;
}

function ensureLocalRoute() {
  if (process.platform !== "darwin") return;

  const friendlyURLObject = new URL(friendlyURL);
  const hostname = friendlyURLObject.hostname;
  if (
    friendlyURLObject.protocol !== "http:" ||
    !/^[a-z0-9.-]+$/i.test(hostname)
  ) {
    throw new Error("DEV_URL must be a valid HTTP hostname.");
  }
  const routerRoot = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "Local",
    "run",
    "router",
    "nginx",
  );
  const configPath = path.join(routerRoot, "conf", "nginx.conf");
  const routePath = path.join(
    routerRoot,
    "conf",
    `route.${hostname}.conf`,
  );
  const nginxExecutable = getLocalNginxExecutable();

  if (!nginxExecutable || !fs.existsSync(configPath)) {
    process.stderr.write(
      `Local router is unavailable; use http://localhost:${port} instead.\n`,
    );
    return;
  }

  const route = `server {
\tlisten 80;
\tlisten [::]:80;

\tserver_name ${hostname};

\tlocation / {
\t\tproxy_pass http://127.0.0.1:${port};
\t\tproxy_http_version 1.1;

\t\tproxy_set_header Host $host;
\t\tproxy_set_header X-Real-IP $remote_addr;
\t\tproxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
\t\tproxy_set_header X-Forwarded-Proto $scheme;
\t\tproxy_set_header Upgrade $http_upgrade;
\t\tproxy_set_header Connection "upgrade";
\t}
}
`;

  if (
    !fs.existsSync(routePath) ||
    fs.readFileSync(routePath, "utf8") !== route
  ) {
    fs.writeFileSync(routePath, route);
  }

  const nginxArguments = ["-c", configPath, "-p", routerRoot];
  const validation = spawnSync(
    nginxExecutable,
    ["-t", ...nginxArguments],
    { encoding: "utf8", timeout: 5000 },
  );
  if (validation.status !== 0) {
    process.stderr.write(
      `Could not validate the ${hostname} route:\n${validation.stderr}`,
    );
    return;
  }

  const reload = spawnSync(
    nginxExecutable,
    ["-s", "reload", ...nginxArguments],
    { encoding: "utf8", timeout: 5000 },
  );
  if (reload.status !== 0) {
    // Local configures its router with `daemon off`, so waiting synchronously
    // here would block forever and prevent Next.js from ever starting.
    const start = spawn(nginxExecutable, nginxArguments, {
      detached: true,
      stdio: "ignore",
    });
    start.once("error", (error) => {
      process.stderr.write(
        `Could not start Local's router; use http://localhost:${port} instead. ${error.message}\n`,
      );
    });
    start.unref();
  }
}

try {
  ensureLocalRoute();
} catch (error) {
  process.stderr.write(
    `Could not prepare ${friendlyURL}; use http://localhost:${port} instead. ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
}

// Start Next.js dev server and intercept output to replace 0.0.0.0 with actual IP
const nextProcess = spawn(
  "npx",
  ["next", "dev", "--hostname", "0.0.0.0", "--port", port],
  {
    stdio: ["inherit", "pipe", "pipe"],
  },
);

process.stdout.write(`\n  Local domain: ${friendlyURL}\n\n`);

nextProcess.once("error", (error) => {
  process.stderr.write(`Failed to start Next.js: ${error.message}\n`);
  process.exit(1);
});

// Replace 0.0.0.0 with actual IP in Next.js output
function replaceIPInOutput(data) {
  const output = data.toString();
  if (localIP) {
    // Replace http://0.0.0.0:PORT with actual IP
    const replaced = output.replace(/0\.0\.0\.0/g, localIP);
    process.stdout.write(
      replaced.replace(`http://localhost:${port}`, friendlyURL),
    );
  } else {
    process.stdout.write(output);
  }
}

nextProcess.stdout.on("data", replaceIPInOutput);
nextProcess.stderr.on("data", replaceIPInOutput);

nextProcess.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
