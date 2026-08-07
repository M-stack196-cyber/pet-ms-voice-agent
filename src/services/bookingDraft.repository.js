const pool = require("../db");

async function insertDraft(draft) {
  await pool.query(
    `
      INSERT INTO booking_drafts (
        id,
        token,
        status,
        data,
        expires_at,
        completed_at,
        token_used_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
    `,
    [
      draft.id,
      draft.token,
      draft.status,
      JSON.stringify(draft),
      draft.expiresAt || null,
      draft.completedAt || null,
      draft.tokenUsedAt || null,
      draft.createdAt || new Date().toISOString(),
      draft.updatedAt ||
        draft.createdAt ||
        new Date().toISOString(),
    ]
  );

  return draft;
}

async function findDraftByToken(token) {
  const result = await pool.query(
    `
      SELECT data
      FROM booking_drafts
      WHERE token = $1
      LIMIT 1
    `,
    [token]
  );

  return result.rows[0]?.data || null;
}

async function findDraftById(id) {
  const result = await pool.query(
    `
      SELECT data
      FROM booking_drafts
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0]?.data || null;
}

async function saveDraft(draft) {
  const result = await pool.query(
    `
      UPDATE booking_drafts
      SET
        status = $2,
        data = $3::jsonb,
        expires_at = $4,
        completed_at = $5,
        token_used_at = $6,
        updated_at = $7
      WHERE id = $1
      RETURNING id
    `,
    [
      draft.id,
      draft.status,
      JSON.stringify(draft),
      draft.expiresAt || null,
      draft.completedAt || null,
      draft.tokenUsedAt || null,
      draft.updatedAt || new Date().toISOString(),
    ]
  );

  return result.rowCount > 0 ? draft : null;
}

async function countActiveHolds({
  facilityId,
  accommodationId,
  dropOffDate,
  collectionDate,
}) {
  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM booking_drafts
      WHERE status = 'draft_created'
        AND expires_at > NOW()
        AND data->'facility'->>'id' = $1
        AND data->'accommodation'->>'id' = $2
        AND (data->'stay'->>'dropOffDate')::date < $4::date
        AND (data->'stay'->>'collectionDate')::date > $3::date
    `,
    [
      facilityId,
      accommodationId,
      dropOffDate,
      collectionDate,
    ]
  );

  return result.rows[0]?.count || 0;
}

module.exports = {
  insertDraft,
  findDraftByToken,
  findDraftById,
  saveDraft,
  countActiveHolds,
};
