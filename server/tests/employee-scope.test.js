process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.ACCESS_TOKEN_EXPIRES_IN = "15m";
process.env.MAX_FAILED_LOGINS = "5";
process.env.SETUP_TOKEN = "test-setup-token";

const { MongoMemoryServer } = require("mongodb-memory-server");

(async () => {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri();
  const { connectDB } = require("../config/database");
  await connectDB(process.env.MONGODB_URI);
  const { seedDatabase } = require("../seeds/seed");
  await seedDatabase();

  const Employee = require("../models/Employee");
  const current = await Employee.find({ status: "Active" })
    .sort({ employeeId: 1 })
    .lean();

  const wanted = [
    "CY0125JS201",
    "CY0824SD301",
    "CY0525RS109",
    "CY0226AR110",
    "CY0626AD111",
    "CY0726SS112",
  ];
  const ids = current.map((e) => e.employeeId);

  const hasSix = ids.length === 6 && wanted.every((id) => ids.includes(id));
  const hasRequiredFields = current.every(
    (e) => e.bloodGroup && e.workMode && e.assignedHrId,
  );

  console.log(JSON.stringify({ hasSix, hasRequiredFields, ids }, null, 2));

  process.exit(hasSix && hasRequiredFields ? 0 : 1);
})();
