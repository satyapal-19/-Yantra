/**
 * contextEngine.js
 * Provides Maharashtra-specific festival and legal context for noise violations.
 *
 * During festival seasons, nighttime violations carry extra legal weight.
 * The Bombay High Court and NGT have issued specific orders about
 * DJ/loudspeaker limits during Ganesh Utsav, Navratri, etc.
 */

/**
 * Maharashtra festival calendar.
 * months: 1-indexed (1 = January, 9 = September, etc.)
 * allowedUntil: hour (24h) after which even festival permissions expire
 */
const MAHARASHTRA_FESTIVAL_CALENDAR = [
  {
    name: 'Ganesh Utsav',
    nameMr: 'गणेश उत्सव',
    months: [8, 9], // Aug–Sep
    allowedUntil: 22, // 10 PM
    ngoCitation: 'Bombay HC Order in PIL (L) No. 142/2016',
  },
  {
    name: 'Ganesh Visarjan',
    nameMr: 'गणेश विसर्जन',
    months: [8, 9],
    allowedUntil: 0, // Midnight on Visarjan day
    ngoCitation: 'Bombay HC — one-time midnight exemption',
  },
  {
    name: 'Navratri / Garba',
    nameMr: 'नवरात्री / गरबा',
    months: [9, 10], // Sep–Oct
    allowedUntil: 0,
    ngoCitation: 'Noise Rules 2000, Rule 5(3)',
  },
  {
    name: 'Dahi Handi',
    nameMr: 'दही हंडी',
    months: [8],
    allowedUntil: 23,
    ngoCitation: 'Local municipal permission required',
  },
  {
    name: 'Diwali',
    nameMr: 'दिवाळी',
    months: [10, 11],
    allowedUntil: 22,
    ngoCitation: 'Noise Rules 2000, Firecracker Restrictions',
  },
];

/**
 * Returns full violation context for a given timestamp and decibel level.
 * @param {number} decibelLevel
 * @param {string} zoneCategory
 * @param {Date} timestamp
 * @returns {Object}
 */
export function getViolationContext(decibelLevel, zoneCategory, timestamp = new Date()) {
  const hour = timestamp.getHours();
  const month = timestamp.getMonth() + 1; // 1-indexed

  const isNighttime = hour >= 22 || hour < 6;

  // Find matching festival (if any)
  const activeFestival = MAHARASHTRA_FESTIVAL_CALENDAR.find((f) =>
    f.months.includes(month)
  );

  // Check if even festival permissions have expired
  const festivalViolation =
    activeFestival && hour >= activeFestival.allowedUntil && hour < 6;

  return {
    isNighttime,
    festivalContext: activeFestival?.name || null,
    festivalContextMr: activeFestival?.nameMr || null,
    festivalViolation,
    ngoCitation: activeFestival?.ngoCitation || 'Noise Pollution (Regulation & Control) Rules, 2000',
    legalCitation: 'Noise Pollution (Regulation & Control) Rules, 2000 — Rule 5',
    // Flag for NGT/High Court relevance: nighttime + very loud + residential/silence zone
    highCourtRelevant:
      isNighttime &&
      decibelLevel > 80 &&
      ['silence', 'residential'].includes(zoneCategory),
    timeLabel: isNighttime
      ? 'Nighttime Violation (Stricter limits apply)'
      : 'Daytime',
  };
}
