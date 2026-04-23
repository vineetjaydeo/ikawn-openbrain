// Ruhi logo assets hosted on R2 CDN
// Source: /ikawn-v3/docs/ruhi-logo.png → uploaded to ikawn-v1 bucket

const RUHI_FAVICON_URL = '/favicon.png';
const RUHI_ICON_URL = '/favicon.png';

const RUHI_FAVICON_LINK = `<link rel="icon" type="image/png" href="${RUHI_FAVICON_URL}">`;

// Instance-aware display name: custom INSTANCE_NAME env var > "Ruhi" on ruhi-os-brain > "Lucy" default
const INSTANCE_NAME = process.env.INSTANCE_NAME || (process.env.FLY_APP_NAME === 'ruhi-os-brain' ? 'Ruhi' : 'Lucy');

module.exports = { RUHI_FAVICON_URL, RUHI_ICON_URL, RUHI_FAVICON_LINK, INSTANCE_NAME };
