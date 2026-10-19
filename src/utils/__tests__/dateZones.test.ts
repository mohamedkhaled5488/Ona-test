// Stage 2: the calendar helpers that use the phone's local time give the same
// answers in every time zone, every day of three years (2026–2028, with a leap
// year), including zones where the clock change happens at midnight
// (America/Santiago), so "midnight" doesn't exist that day.
import { ZONES, prepareZones } from '../../test-utils';

const z = prepareZones(['clock', 'date']);

// Runs in each zone: walk every day and check the local-time helpers.
const CHECK = `
  const d = m.date;
  const problems = [];
  let iso = '2026-01-01';
  let doy = 0;
  while (iso <= '2028-12-31') {
    // Month grid: every day once, in order.
    if (iso.slice(8) === '01') {
      const grid = d.getMonthGrid(iso, 1).filter(Boolean);
      if (grid.length !== d.daysInMonthISO(iso)) problems.push('grid length ' + iso);
      grid.forEach((x, i) => { if (x !== iso.slice(0, 8) + String(i + 1).padStart(2, '0')) problems.push('grid ' + x); });
      if (d.addMonthsISO(iso, 1) !== d.addDaysISO(iso, d.daysInMonthISO(iso))) problems.push('addMonths ' + iso);
    }
    if (iso.slice(5) === '01-01') doy = 0;
    if (d.dayOfYear(iso) !== doy) problems.push('dayOfYear ' + iso + ' ' + d.dayOfYear(iso));
    if (d.toISODate(new Date(iso + 'T12:00:00')) !== iso) problems.push('toISODate ' + iso);
    doy += 1;
    iso = d.addDaysISO(iso, 1);
  }
  return problems.slice(0, 10);
`;

describe('DATE-Z: local-time helpers agree in every zone', () => {
  test.each(ZONES)('DATE-Z-001 %s: month grids, adding months and day of the year, 2026–2028', (tz) => {
    expect(z.run(tz, CHECK)).toEqual([]);
  });
});
