import { loadConfig } from "./config.js";
import { createPool, runMigrations } from "./db.js";
import { Indexer } from "./indexer.js";

function intArg(name: string): number | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  const raw = arg ? arg.slice(prefix.length) : process.env[name.toUpperCase().replace(/-/g, "_")];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

const toHeight = intArg("to-height");
if (toHeight === undefined) throw new Error("missing --to-height=<height> or TO_HEIGHT");

const config = loadConfig();
const pool = createPool(config);
const indexer = new Indexer(config, pool);
let totalProcessed = 0;
try {
  const applied = await runMigrations(pool);
  if (applied.length > 0) console.log(`migrations applied=${applied.join(",")}`);
  for (;;) {
    const result = await indexer.runUntilHeight(toHeight);
    totalProcessed += result.processed;
    console.log(`bounded backfill processed=${result.processed} total=${totalProcessed} head=${result.head} target=${result.target} to_height=${toHeight}`);
    if (result.done) break;
  }
} finally {
  await indexer.close();
  await pool.end();
}
