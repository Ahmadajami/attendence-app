// The airport time zone on its own, so pure modules (`#lib/roster`) and the CLI scripts can use it
// without loading `#lib/utils/datetime.js` and the paraglide runtime it imports.

/** Airport time zone: every instant is shown in Damascus time, whatever the device's zone (CLAUDE.md §6.4). */
export const AIRPORT_TIME_ZONE = 'Asia/Damascus';
