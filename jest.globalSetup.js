// Runs once before the test workers start, so they inherit this time zone.
// Pinned to a zone with daylight saving so date tests (Recap's DST cases)
// mean the same thing on every machine. Changing TZ inside a test file
// doesn't take effect on Windows, which is why it lives here.
module.exports = async () => {
  process.env.TZ = 'America/New_York';
};
