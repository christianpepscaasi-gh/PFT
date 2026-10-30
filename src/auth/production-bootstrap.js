const { validateBootstrap } = require('./bootstrap');

function accountSetup(values) {
  const required = ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'USER_EMAIL', 'USER_PASSWORD'];
  const missing = required.filter((key) => typeof values[key] !== 'string' || !values[key].trim());
  if (missing.length) throw new Error(`Missing account fields: ${missing.join(', ')}.`);
  // Never include credential values in validation errors.
  return validateBootstrap({
    admin: { name: values.ADMIN_NAME || 'Owner Admin', email: values.ADMIN_EMAIL, password: values.ADMIN_PASSWORD },
    user: { name: values.USER_NAME || 'Personal User', email: values.USER_EMAIL, password: values.USER_PASSWORD }
  });
}

function productionTarget(value) {
  try {
    const uri = new URL(value);
    const database = decodeURIComponent(uri.pathname.slice(1));
    if (!['mongodb:', 'mongodb+srv:'].includes(uri.protocol) || !uri.hostname
      || !/^[A-Za-z0-9_-]{1,63}$/.test(database) || /test/i.test(database)
      || ['admin', 'local', 'config'].includes(database.toLowerCase())
      || [...uri.searchParams.keys()].some((key) => key.toLowerCase() === 'dbname')) throw new Error();
    return { uri: value, database };
  } catch { throw new Error('Production target requires a named, non-test Mongo database without a database override.'); }
}

function productionArguments(args) {
  if (args.length !== 2 && args.length !== 5) throw new Error('Use --target production, or --target production --database NAME --apply.');
  if (args[0] !== '--target' || args[1] !== 'production'
    || (args.length === 5 && (args[2] !== '--database' || !args[3] || args[4] !== '--apply'))) {
    throw new Error('Use --target production, or --target production --database NAME --apply.');
  }
  return { apply: args.length === 5, database: args[3] };
}

module.exports = { accountSetup, productionTarget, productionArguments };
