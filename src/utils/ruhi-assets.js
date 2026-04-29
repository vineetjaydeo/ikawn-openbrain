// Ruhi logo assets hosted on R2 CDN
// Source: /ikawn-v3/docs/ruhi-logo.png → uploaded to ikawn-v1 bucket

const RUHI_FAVICON_URL = '/favicon.png';
const RUHI_ICON_URL = '/favicon.png';

const RUHI_FAVICON_LINK = `<link rel="icon" type="image/png" href="${RUHI_FAVICON_URL}">`;

// Instance-aware display name precedence:
//   1. BRAND_DISPLAY_NAME (canonical, used to brand a deploy — e.g. Fedfina = "Ruhi | iKawn Intelligence OS")
//   2. INSTANCE_NAME (legacy alias, kept for backward compat)
//   3. "Ruhi" on ruhi-os-brain, "Lucy" everywhere else (Lucy is the default persona on ikawn-openbrain)
const INSTANCE_NAME = process.env.BRAND_DISPLAY_NAME
  || process.env.INSTANCE_NAME
  || (process.env.FLY_APP_NAME === 'ruhi-os-brain' ? 'Ruhi' : 'Lucy');

module.exports = { RUHI_FAVICON_URL, RUHI_ICON_URL, RUHI_FAVICON_LINK, INSTANCE_NAME };
