// Usage: npm run stats:hash -- "your password"
// Prints the value to put in STATS_PASS_HASH. The password itself is never stored anywhere.
import { hashPassword } from '../server/analytics/auth.js';

const light = process.argv.includes('--light'); // Cloudflare Workers Free: 10 ms CPU limit
const pw = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!pw || pw.length < 8) {
  console.error('Usage: npm run stats:hash -- "password" [--light]   (at least 8 characters; --light for Cloudflare Workers Free)');
  process.exit(1);
}
console.log(await hashPassword(pw, undefined, light ? 2048 : 16384));
