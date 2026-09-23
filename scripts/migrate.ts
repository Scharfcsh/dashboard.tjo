// Apply db/migrations/*.sql in filename order, each in its own transaction.
// Usage: npm run db:migrate            (uses EVENTS_DATABASE_URL)
//        DATABASE_URL=... npm run db:migrate
import { config as loadEnv } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

export async function migrate(connectionString: string, log = console.log): Promise<string[]> {
  const client = new Client({ connectionString });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    const dir = path.join(process.cwd(), "db", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = readFileSync(path.join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
      applied.push(file);
      log(`applied ${file}`);
    }
    if (applied.length === 0) log("nothing to apply");
    return applied;
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).includes(path.join("scripts", "migrate"));
if (isMain) {
  const url = process.env.DATABASE_URL || process.env.EVENTS_DATABASE_URL;
  if (!url) {
    console.error("Set EVENTS_DATABASE_URL (or DATABASE_URL)");
    process.exit(1);
  }
  migrate(url).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
