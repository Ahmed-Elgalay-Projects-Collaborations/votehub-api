const dbName = process.env.MONGO_INITDB_DATABASE || "votehub";
const appUser = process.env.MONGO_APP_USER || "votehub";
const appPass = process.env.MONGO_APP_PASS || "votehub_password_change_me";

db = db.getSiblingDB(dbName);

try {
  db.createUser({
    user: appUser,
    pwd: appPass,
    roles: [{ role: "readWrite", db: dbName }]
  });
} catch (error) {
  // If the user already exists, keep container startup idempotent.
  console.log(`User ${appUser} already exists, skipping creation.`);
}

