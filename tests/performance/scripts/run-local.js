const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { MongoMemoryServer } = require('../../../server/node_modules/mongodb-memory-server');

const root = path.resolve(__dirname, '..', '..', '..');
const performanceDir = path.resolve(__dirname, '..');
const resultsDir = path.join(performanceDir, 'results');
const usersFile = path.join(performanceDir, 'data', 'test-users.json');
const serverEntry = path.join(root, 'server', 'server.js');
const seedEntry = path.join(__dirname, 'seed-test-users.js');
const profileLimits = { smoke: 5, authentication: 5, baseline: 20 };

function randomPassword() {
  return crypto.randomBytes(24).toString('base64url');
}

function prepareUsers(perProfileLimit) {
  if (fs.existsSync(usersFile)) {
    throw new Error('Refusing to overwrite tests/performance/data/test-users.json; move it before running the isolated test.');
  }
  const roles = ['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN', 'SUPER_ADMIN'];
  const perRole = Math.ceil(perProfileLimit / roles.length);
  const config = Object.fromEntries(roles.map((role) => [
    role,
    Array.from({ length: perRole }, (_, index) => {
      const suffix = String(index + 1).padStart(4, '0');
      return {
        email: `k6-${role.toLowerCase()}-${suffix}@performance.test`,
        password: randomPassword(),
      };
    }),
  ]));
  fs.mkdirSync(path.dirname(usersFile), { recursive: true });
  fs.writeFileSync(usersFile, `${JSON.stringify(config, null, 2)}\n`, { flag: 'w' });
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function runNodeScript(entry, environment) {
  const result = spawnSync(process.execPath, [entry], {
    cwd: root,
    env: { ...process.env, ...environment },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(entry)} failed with exit code ${result.status}.`);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForReady(server, baseUrl) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    if (server.exitCode !== null) throw new Error(`Local app exited with code ${server.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const health = await response.json();
        if (health.database === 'connected') return;
      }
    } catch (error) {
      if (error.name !== 'AbortError' && error.name !== 'TimeoutError' && error.cause?.code !== 'ECONNREFUSED') {
        throw error;
      }
    }
    await wait(250);
  }
  throw new Error('Local app did not become ready within 30 seconds.');
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await Promise.race([exited, wait(5000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function main() {
  const profile = process.argv[2] || 'smoke';
  const maxVus = profileLimits[profile];
  if (!maxVus) {
    throw new Error('Allowed local in-memory profiles: smoke, authentication, baseline.');
  }
  if (process.env.NODE_ENV === 'production' || process.env.K6_ENV === 'production') {
    throw new Error('The in-memory local runner cannot be used with production mode.');
  }

  const k6Path = process.env.K6_BIN || path.join(process.env.ProgramFiles || 'C:\\Program Files', 'k6', 'k6.exe');
  if (!fs.existsSync(k6Path)) throw new Error('Set K6_BIN or install k6 at its standard Windows location.');

  fs.mkdirSync(resultsDir, { recursive: true });
  const port = await getAvailablePort();
  prepareUsers(maxVus);
  const baseUrl = `http://127.0.0.1:${port}`;
  let database;
  let server;

  try {
    database = await MongoMemoryServer.create({ instance: { dbName: 'cyethack_hrm_k6' } });
    const environment = {
      NODE_ENV: 'development',
      PORT: String(port),
      MONGODB_URI: database.getUri('cyethack_hrm_k6'),
      JWT_SECRET: crypto.randomBytes(48).toString('base64'),
      JWT_REFRESH_SECRET: crypto.randomBytes(48).toString('base64'),
      ACCESS_TOKEN_EXPIRES_IN: '15m',
      REFRESH_TOKEN_EXPIRES_IN: '7d',
      FRONTEND_URL: baseUrl,
      DOCUMENT_STORAGE: 'local',
    };

    console.log(`Starting ephemeral MongoDB for ${profile}; no persistent app database is used.`);
    runNodeScript(seedEntry, {
      ...environment,
      K6_ENV: 'local',
      K6_SEED_CONFIRM: 'CREATE_K6_TEST_USERS',
      K6_USERS_FILE: '../data/test-users.json',
    });

    server = spawn(process.execPath, [serverEntry], {
      cwd: root,
      env: environment,
      stdio: 'inherit',
    });
    await waitForReady(server, baseUrl);

    const scenario = path.join(performanceDir, 'scenarios', `${profile}.js`);
    const k6Arguments = [
      'run',
      '-e', 'K6_ENV=local',
      '-e', `BASE_URL=${baseUrl}`,
      '-e', `API_BASE_URL=${baseUrl}/api`,
      '-e', 'TARGET_VUS=20',
      '-e', 'K6_STRESS_VUS=30',
      '-e', 'TEST_DURATION=10s',
      '-e', 'K6_USERS_FILE=../data/test-users.json',
      scenario,
    ];
    console.log(`Running ${profile} against the isolated in-memory app at ${baseUrl}.`);
    const result = spawnSync(k6Path, k6Arguments, { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`k6 ${profile} failed with exit code ${result.status}.`);
  } finally {
    await stopChild(server);
    if (database) await database.stop();
    if (fs.existsSync(usersFile)) fs.unlinkSync(usersFile);
  }
}

main().catch((error) => {
  console.error(`Local performance test failed: ${error.message}`);
  process.exitCode = 1;
});
