// Reset the database to the sample dataset: `npm run seed`
import { openDb } from "./db.js";
const dbx = await openDb({ seed: "force" });
dbx.save();
console.log("Database reset with sample data →", (await import("./db.js")).DB_FILE);
process.exit(0);
