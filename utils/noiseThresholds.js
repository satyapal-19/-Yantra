/**
 * noiseThresholds.js
 * CPCB Noise Pollution (Regulation & Control) Rules, 2000 — Schedule
 * Ambient Air Quality Standards in Respect of Noise: dB(A) Leq
 *
 * Daytime: 06:00 – 22:00 IST
 * Nighttime: 22:00 – 06:00 IST
 */

export const NOISE_LIMITS = {
  silence: { day: 50, night: 40 },
  residential: { day: 55, night: 45 },
  commercial: { day: 65, night: 55 },
  industrial: { day: 75, night: 70 },
};

/**
 * Returns legal dB(A) limit for a given zone and timestamp.
 * @param {string} zoneCategory - 'silence' | 'residential' | 'commercial' | 'industrial'
 * @param {Date} timestamp
 * @returns {number} Legal limit in dB(A)
 */
export function getLegalLimit(zoneCategory, timestamp = new Date()) {
  const hour = timestamp.getHours();
  const isNight = hour >= 22 || hour < 6;
  const zone = NOISE_LIMITS[zoneCategory] || NOISE_LIMITS.residential;
  return isNight ? zone.night : zone.day;
}

/**
 * Returns severity classification based on violation duration.
 * @param {number} violationSeconds - Seconds above limit in 60s window
 * @returns {'normal' | 'warning' | 'severe'}
 */
export function classifySeverity(violationSeconds) {
  if (violationSeconds >= 40) return 'severe';
  if (violationSeconds >= 20) return 'warning';
  return 'normal';
}

/**
 * Human-readable zone labels (English + Marathi)
 */
export const ZONE_LABELS = {
  silence: { en: 'Silence Zone', mr: 'शांतता क्षेत्र' },
  residential: { en: 'Residential', mr: 'निवासी क्षेत्र' },
  commercial: { en: 'Commercial', mr: 'व्यावसायिक क्षेत्र' },
  industrial: { en: 'Industrial', mr: 'औद्योगिक क्षेत्र' },
};

export const SEVERITY_LABELS = {
  normal: { en: 'Normal', mr: 'सामान्य', color: '#22c55e' },
  warning: { en: 'Warning', mr: 'सावधान', color: '#f59e0b' },
  severe: { en: 'Severe Violation', mr: 'गंभीर उल्लंघन', color: '#ef4444' },
};
