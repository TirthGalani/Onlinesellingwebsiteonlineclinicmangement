const { reply, method, clearSessionCookie, guardMutation } = require('../_lib/http');

module.exports = function handler(req, res) {
  if (!method(req, ['POST'], res)) return;
  if (!guardMutation(req, res)) return;
  res.setHeader('Set-Cookie', clearSessionCookie());
  return reply(res, 200, { ok: true });
};
