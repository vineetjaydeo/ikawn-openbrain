const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const KEY_PREFIX = "openbrain/";
const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024; // 50MB

let s3Client = null;

function getClient() {
  if (!s3Client) {
    const accountId = process.env.R2_ACCOUNT_ID;
    if (!accountId) throw new Error("R2_ACCOUNT_ID is not set");

    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

function prefixedKey(key) {
  return key.startsWith(KEY_PREFIX) ? key : KEY_PREFIX + key;
}

/**
 * Upload a file to R2.
 * @param {string} key - Object key (auto-prefixed with openbrain/).
 * @param {Buffer|string|ReadableStream} body - File contents.
 * @param {string} contentType - MIME type.
 * @returns {Promise<string>} Public URL of the uploaded object.
 */
async function uploadToR2(key, body, contentType) {
  const fullKey = prefixedKey(key);
  const client = getClient();

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fullKey,
      Body: body,
      ContentType: contentType,
    })
  );

  const publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  return `${publicUrl}/${fullKey}`;
}

/**
 * Generate a presigned PUT URL for direct client uploads.
 * @param {string} key - Object key (auto-prefixed with openbrain/).
 * @param {string} contentType - MIME type.
 * @param {number} [expiresIn=3600] - URL validity in seconds.
 * @returns {Promise<string>} Presigned PUT URL.
 */
async function getPresignedUploadUrl(key, contentType, expiresIn = 3600) {
  const fullKey = prefixedKey(key);
  const client = getClient();

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: fullKey,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Download a URL to a Buffer.
 * @param {string} url - URL to download.
 * @returns {Promise<Buffer>} Downloaded content.
 */
async function downloadFromUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    }

    const contentLength = Number(res.headers.get("content-length") || 0);
    if (contentLength > MAX_DOWNLOAD_SIZE) {
      throw new Error(
        `File too large: ${contentLength} bytes (max ${MAX_DOWNLOAD_SIZE})`
      );
    }

    const arrayBuffer = await res.arrayBuffer();

    if (arrayBuffer.byteLength > MAX_DOWNLOAD_SIZE) {
      throw new Error(
        `File too large: ${arrayBuffer.byteLength} bytes (max ${MAX_DOWNLOAD_SIZE})`
      );
    }

    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  uploadToR2,
  getPresignedUploadUrl,
  downloadFromUrl,
};
