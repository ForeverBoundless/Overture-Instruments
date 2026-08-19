// harness.mjs — construction-only smoke test.
import './harness-setup.mjs';

const errors = [];
process.on('unhandledRejection', (err) => { errors.push(err); });

try {
  await import('./js/app.js');
  document.dispatchEvent('DOMContentLoaded');
  console.log('App constructed without throwing.');
} catch (err) {
  console.error('CONSTRUCTION ERROR:', err.stack || err);
  process.exitCode = 1;
}

if (errors.length) {
  errors.forEach((e) => console.error('UNHANDLED REJECTION:', e.stack || e));
  process.exitCode = 1;
}
