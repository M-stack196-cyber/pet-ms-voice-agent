require("dotenv").config();

const pool = require("../src/db");

async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS booking_drafts (
        id TEXT PRIMARY KEY,
        token TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        data JSONB NOT NULL,
        expires_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        token_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_booking_drafts_token
      ON booking_drafts(token);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_booking_drafts_status
      ON booking_drafts(status);
    `);

    console.log("✅ PostgreSQL database initialized successfully");
  } catch (error) {
    console.error(
      "❌ Database initialization failed:",
      error.message
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

initDatabase();
