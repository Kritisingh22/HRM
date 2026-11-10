/* Convenience launcher: runs the FULL app (portal + API) against a throwaway
 * in-memory MongoDB, seeded with the dev data — so you can try everything
 * without installing MongoDB. Data is not persisted between runs.
 *
 *   npm run dev:mem      → open http://localhost:5000
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri();
  const { connectDB } = require('../config/database');
  await connectDB(process.env.MONGODB_URI);
  const { seedDatabase } = require('../seeds/seed');
  await seedDatabase();
  const app = require('../app');
  const cfg = require('../config/env');
  app.listen(cfg.PORT, () => {
    console.log('DEV (in-memory Mongo) running: http://localhost:' + cfg.PORT);
    console.log('Login with e.g.  employee@cyethack.com / Employee@123  or  hr@cyethack.com / Hr@123');
  });
})().catch((e) => { console.error(e); process.exit(1); });
