// src/connectors/credential-store.js
'use strict';

const { pool } = require('../db');

/**
 * Store or update connector credentials for a brand.
 * Uses ON CONFLICT upsert on (brand_id, connector_type).
 */
async function storeCredentials(brandId, connectorType, credentials) {
  try {
    const { rows } = await pool.query(`
      INSERT INTO ob_connector_credentials (brand_id, connector_type, credentials, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (brand_id, connector_type) DO UPDATE SET
        credentials = $3,
        status = 'active',
        updated_at = NOW()
      RETURNING id
    `, [brandId, connectorType, JSON.stringify(credentials)]);
    return rows[0]?.id || null;
  } catch (err) {
    console.error(`[CredentialStore] Failed to store credentials for ${brandId}/${connectorType}:`, err.message);
    return null;
  }
}

/**
 * Retrieve active credentials for a brand + connector type.
 * Returns the parsed credentials object, or null if not found/expired/revoked.
 */
async function getCredentials(brandId, connectorType) {
  try {
    const { rows } = await pool.query(
      `SELECT credentials, status, last_sync FROM ob_connector_credentials
       WHERE brand_id = $1 AND connector_type = $2 AND status = 'active'`,
      [brandId, connectorType]
    );
    if (rows.length === 0) return null;
    return rows[0].credentials;
  } catch (err) {
    console.error(`[CredentialStore] Failed to retrieve credentials for ${brandId}/${connectorType}:`, err.message);
    return null;
  }
}

/**
 * Update the last_sync timestamp after a successful sync.
 */
async function updateLastSync(brandId, connectorType) {
  try {
    await pool.query(
      `UPDATE ob_connector_credentials SET last_sync = NOW(), updated_at = NOW()
       WHERE brand_id = $1 AND connector_type = $2`,
      [brandId, connectorType]
    );
  } catch (err) {
    console.error(`[CredentialStore] Failed to update last_sync:`, err.message);
  }
}

/**
 * Mark credentials as expired (e.g., after failed token refresh).
 */
async function markExpired(brandId, connectorType) {
  try {
    await pool.query(
      `UPDATE ob_connector_credentials SET status = 'expired', updated_at = NOW()
       WHERE brand_id = $1 AND connector_type = $2`,
      [brandId, connectorType]
    );
  } catch (err) {
    console.error(`[CredentialStore] Failed to mark expired:`, err.message);
  }
}

/**
 * List all active connectors for a brand.
 * Returns array of { connector_type, status, last_sync, created_at }.
 */
async function listConnectors(brandId) {
  try {
    const { rows } = await pool.query(
      `SELECT connector_type, status, last_sync, created_at
       FROM ob_connector_credentials
       WHERE brand_id = $1
       ORDER BY connector_type`,
      [brandId]
    );
    return rows;
  } catch (err) {
    console.error(`[CredentialStore] Failed to list connectors for ${brandId}:`, err.message);
    return [];
  }
}

/**
 * Revoke (soft-delete) credentials for a connector.
 */
async function revokeCredentials(brandId, connectorType) {
  try {
    await pool.query(
      `UPDATE ob_connector_credentials SET status = 'revoked', updated_at = NOW()
       WHERE brand_id = $1 AND connector_type = $2`,
      [brandId, connectorType]
    );
    return true;
  } catch (err) {
    console.error(`[CredentialStore] Failed to revoke:`, err.message);
    return false;
  }
}

module.exports = {
  storeCredentials,
  getCredentials,
  updateLastSync,
  markExpired,
  listConnectors,
  revokeCredentials,
};
