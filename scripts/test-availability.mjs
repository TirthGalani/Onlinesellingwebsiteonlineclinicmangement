import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  zonedTimeToUtc,
  formatTimeInZone,
  formatDateOnlyInZone,
  weekdayForDateOnly
} = require('../api/_lib/appointments.js');

// Winter (EST, UTC-5)
assert.equal(
  zonedTimeToUtc('2026-11-20', '11:00', 'America/New_York').toISOString(),
  '2026-11-20T16:00:00.000Z',
  'winter clinic time should convert to UTC'
);
// Summer (EDT, UTC-4)
assert.equal(
  zonedTimeToUtc('2026-07-10', '11:00', 'America/New_York').toISOString(),
  '2026-07-10T15:00:00.000Z',
  'summer clinic time should respect daylight saving'
);
// Round trip
assert.equal(formatTimeInZone(new Date('2026-11-20T16:00:00Z'), 'America/New_York'), '11:00');
assert.equal(formatDateOnlyInZone(new Date('2026-11-20T16:00:00Z'), 'America/New_York'), '2026-11-20');
assert.equal(weekdayForDateOnly('2026-11-20'), 5, '2026-11-20 is a Friday');

console.log('Availability timezone tests passed (4 assertions).');
