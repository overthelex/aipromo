import { initDatabase, closeDatabase } from "../src/storage/store.js";

async function main() {
  await initDatabase();
  console.log("Database tables created successfully");
  await closeDatabase();
}

main().catch((err) => {
  console.error("Failed to init database:", err.message);
  process.exit(1);
});
