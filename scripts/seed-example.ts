// Dev only: loads the reconstructed 300926 Sabre parade state (placeholder
// names for present people) so the app can be tried without the real import.
//   npm run seed

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { writeCoy } = await import("@/lib/data/write-coy");
  const { exampleSnapshot } = await import("@/tests/fixtures/example-snapshot");

  const result = await writeCoy(db, { ...exampleSnapshot(), telegram: { chatId: null, threadId: null } });
  console.log("Seeded example coy:", result);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
