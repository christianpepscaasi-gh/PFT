// This policy assumes the Function is reachable only through Vercel's ingress.
// Request headers are never used to select the trust policy.
function proxyTrust(env = process.env) {
  const mode = env.PROXY_MODE || 'direct';
  if (mode === 'direct') return false;
  if (mode !== 'vercel') throw new Error('PROXY_MODE must be direct or vercel.');
  if (env.VERCEL !== '1' || env.NODE_ENV !== 'production') {
    throw new Error('PROXY_MODE=vercel requires the Vercel production Node runtime.');
  }
  // Trust the immediate platform hop, not arbitrary addresses further upstream.
  return 1;
}

module.exports = { proxyTrust };
