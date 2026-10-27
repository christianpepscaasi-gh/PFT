const { scrypt, randomBytes, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const derive = promisify(scrypt);
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

function validPassword(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 128;
}

async function hashPassword(password) {
  if (!validPassword(password)) throw new Error('Password must contain 12 to 128 characters.');
  const salt = randomBytes(16);
  const hash = await derive(password, salt, 64, options);
  return `scrypt$131072$8$1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

async function verifyPassword(password, stored) {
  if (!validPassword(password) || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts.slice(0, 4).join('$') !== 'scrypt$131072$8$1'
    || !/^[\w-]{22}$/.test(parts[4]) || !/^[\w-]{86}$/.test(parts[5])) return false;
  const hash = await derive(password, Buffer.from(parts[4], 'base64url'), 64, options);
  return timingSafeEqual(hash, Buffer.from(parts[5], 'base64url'));
}

module.exports = { hashPassword, verifyPassword, validPassword };
