/**
 * Creates a mock Express request with session data.
 */
function mockRequest({ userId = 1, role = 'user', brandId = 'ikawn' } = {}) {
  return {
    session: {
      user: { id: userId, role, email: `user${userId}@test.com` },
    },
    brand_id: brandId,
    body: {},
    params: {},
    query: {},
    headers: {},
  };
}

function mockResponse() {
  const res = {
    status: function(code) { res.statusCode = code; return res; },
    json: function(data) { res.body = data; return res; },
    send: function(data) { res.body = data; return res; },
    write: function(data) { res.chunks = res.chunks || []; res.chunks.push(data); return true; },
    end: function() { res.ended = true; return res; },
    setHeader: function(k, v) { res.headers = res.headers || {}; res.headers[k] = v; return res; },
    statusCode: 200,
    body: null,
    ended: false,
  };
  return res;
}

module.exports = { mockRequest, mockResponse };
