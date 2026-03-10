import { Database } from "bun:sqlite";

console.log("Connecting to database...");
const db = new Database("tracker.db");

console.log("Dropping existing listings table...");
db.run("DROP TABLE IF EXISTS listings;");
db.close();

console.log("Table dropped. Re-initializing schema...");

// Dynamically import db.ts to trigger the CREATE TABLE IF NOT EXISTS block
import('./db').then(() => {
    console.log("Successfully recreated the listings table with the latest schema.");
    console.log("Done.");
    process.exit(0);
}).catch(err => {
    console.error("Failed to recreate schema:", err);
    process.exit(1);
});
