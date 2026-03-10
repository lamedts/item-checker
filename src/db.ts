import { Database } from "bun:sqlite";

// Initialize the database
// This creates a file named 'tracker.db' in the current directory if it doesn't exist
const db = new Database("tracker.db", { create: true });

// Ensure the listings table exists
db.run(`
  CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    title TEXT NOT NULL,
    price TEXT NOT NULL,
    url TEXT NOT NULL,
    posted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export interface Listing {
  id: string; // usually platform + original_id
  platform: 'carousell' | 'dcfever';
  title: string;
  price: string;
  url: string;
  postedAt?: string;
}

/**
 * Checks if a listing already exists in the database.
 */
export function isListingSeen(id: string): boolean {
  const statement = db.prepare("SELECT id FROM listings WHERE id = ?");
  const row = statement.get(id);
  return row !== null;
}

/**
 * Adds a new listing to the database.
 */
export function addListing(listing: Listing): void {
  const statement = db.prepare(`
    INSERT OR IGNORE INTO listings (id, platform, title, price, url, posted_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  statement.run(
    listing.id,
    listing.platform,
    listing.title,
    listing.price,
    listing.url,
    listing.postedAt || null
  );
}

export default db;
