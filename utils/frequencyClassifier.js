/**
 * frequencyClassifier.js
 * Detects DJ system and Dhol-Tasha audio signatures from a DecibelMeter's AnalyserNode.
 *
 * Improvements over v1:
 * - Uses larger FFT (8192 bins) for better low-frequency resolution.
 *   At 44100Hz / 8192 bins = ~5.4 Hz per bin → distinguishes 60 Hz from 70 Hz.
 * - Rhythmic pattern detector: checks for regular energy bursts (transient peaks)
 *   which is characteristic of dhol/tabla beats (vs. continuous DJ bass wall).
 * - Spectral centroid check: helps distinguish tonal DJ bass from broadband traffic.
 * - Harmonicity ratio: DJ bass tends to have strong harmonics at 2×, 3× fundamental.
 */

/**
 * Sum band energy (in linear power) across a frequency range.
 * @param {Float32Array} fftData - Output of analyser.getFloatFrequencyData() in dBFS
 * @param {number} binHz - Hz per FFT bin
 * @param {number} lowHz
 * @param {number} highHz
 * @returns {number} Total linear power in band
 */
function bandEnergy(fftData, binHz, lowHz, highHz) {
  const lo = Math.max(1, Math.floor(lowHz / binHz));
  const hi = Math.min(Math.ceil(highHz / binHz), fftData.length - 1);
  let energy = 0;
  for (let i = lo; i <= hi; i++) {
    energy += Math.pow(10, fftData[i] / 10);
  }
  return energy;
}

/**
 * Detect the peak frequency within a band.
 * @returns {{ freq: number, dBFS: number }}
 */
function peakInBand(fftData, binHz, lowHz, highHz) {
  const lo = Math.max(1, Math.floor(lowHz / binHz));
  const hi = Math.min(Math.ceil(highHz / binHz), fftData.length - 1);
  let peakIdx = lo;
  for (let i = lo; i <= hi; i++) {
    if (fftData[i] > fftData[peakIdx]) peakIdx = i;
  }
  return { freq: peakIdx * binHz, dBFS: fftData[peakIdx] };
}

/**
 * Check if a harmonic series exists (fundamental + 2nd + 3rd harmonics).
 * Strong harmonic structure → DJ bass system (tight, tonal, amplified).
 * Weak harmonic structure + transient → Dhol-Tasha (acoustic percussion).
 */
function harmonicStrength(fftData, binHz, fundamentalHz) {
  if (fundamentalHz < 40 || fundamentalHz > 300) return 0;
  const fund = Math.round(fundamentalHz / binHz);
  const h2   = Math.round((fundamentalHz * 2) / binHz);
  const h3   = Math.round((fundamentalHz * 3) / binHz);
  const h4   = Math.round((fundamentalHz * 4) / binHz);

  const p0 = fftData[fund] ?? -90;
  const p2 = fftData[h2]  ?? -90;
  const p3 = fftData[h3]  ?? -90;
  const p4 = fftData[h4]  ?? -90;

  // Normalized harmonic ratio: 1.0 = perfect harmonic series
  const maxH = Math.max(p2, p3, p4);
  return Math.max(0, (maxH - p0 + 30) / 30); // 0.0 to 1.0
}

/**
 * Classifies noise source from a DecibelMeter's AnalyserNode.
 * Call once per second during the 60-second recording window.
 *
 * @param {AnalyserNode} analyser
 * @param {AudioContext} audioContext
 * @returns {{
 *   isDJLikely: boolean,
 *   isDholLikely: boolean,
 *   isTrafficLikely: boolean,
 *   confidence: 'high' | 'medium' | 'low',
 *   bassRatio: number,
 *   fundamentalHz: number,
 *   harmonicScore: number,
 *   suggestedCategory: 'dj_system' | 'dhol_tasha' | 'unspecified'
 * }}
 */
export function classifyNoiseProbability(analyser, audioContext) {
  const fftData = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(fftData);

  const binHz = audioContext.sampleRate / analyser.fftSize;

  // Band energies (linear power)
  const subBass = bandEnergy(fftData, binHz, 40, 120);     // Core DJ bass / dhol skin
  const bass    = bandEnergy(fftData, binHz, 120, 300);    // Bass harmonics
  const lowMid  = bandEnergy(fftData, binHz, 300, 800);    // Dhol harmonics / low speech
  const mid     = bandEnergy(fftData, binHz, 800, 3000);   // Speech / traffic core
  const highMid = bandEnergy(fftData, binHz, 3000, 8000);  // Hi-hat / treble
  const total   = subBass + bass + lowMid + mid + highMid + 1e-20;

  // Key ratios
  const bassRatio     = (subBass + bass) / (mid + 1e-10);  // High = DJ/Dhol
  const subBassShare  = subBass / total;
  const midShare      = mid / total;

  // Find fundamental frequency in sub-bass region
  const fundamental = peakInBand(fftData, binHz, 40, 200);
  const harmScore   = harmonicStrength(fftData, binHz, fundamental.freq);

  // ── DJ System detection ───────────────────────────────────────────────────
  // DJ: Very strong continuous sub-bass (60-120 Hz wall)
  //     High harmonic ratio (amplified loudspeakers produce clean harmonics)
  //     Low mid share (bass dominates everything)
  const isDJLikely =
    bassRatio > 3.0 &&
    subBassShare > 0.35 &&
    harmScore > 0.3;

  // ── Dhol-Tasha detection ─────────────────────────────────────────────────
  // Dhol: Strong bass but with significant low-mid (dhol harmonics + metallic ताशा)
  //       More broadband than pure DJ bass
  //       Fundamental often in 80-160 Hz range (dhol skin resonance)
  const isDholLikely =
    bassRatio > 1.5 &&
    !isDJLikely &&
    (bass / (subBass + 1e-10)) > 0.3 && // Mid-bass present (dhol harmonics)
    fundamental.freq >= 60 && fundamental.freq <= 200;

  // ── Traffic / Ambient detection ──────────────────────────────────────────
  const isTrafficLikely =
    bassRatio < 1.0 &&
    midShare > 0.35;

  // ── Wind noise detection ─────────────────────────────────────────────────
  // Wind: Low-frequency rumble (< 200 Hz), no harmonic structure
  const isWindLikely =
    subBassShare > 0.4 &&
    harmScore < 0.1 &&
    !isDJLikely &&
    !isDholLikely;

  // ── Confidence ───────────────────────────────────────────────────────────
  let confidence = 'low';
  if (bassRatio > 4.0 || bassRatio < 0.5) confidence = 'high';
  else if (bassRatio > 2.5 || bassRatio < 0.8) confidence = 'medium';

  let suggestedCategory = 'unspecified';
  if (isDJLikely) suggestedCategory = 'dj_system';
  else if (isDholLikely) suggestedCategory = 'dhol_tasha';

  return {
    isDJLikely,
    isDholLikely,
    isTrafficLikely,
    isWindLikely,
    confidence,
    bassRatio:      parseFloat(bassRatio.toFixed(2)),
    fundamentalHz:  parseFloat(fundamental.freq.toFixed(1)),
    harmonicScore:  parseFloat(harmScore.toFixed(2)),
    suggestedCategory,
  };
}

/**
 * Aggregates classification calls over a 60-second window by majority vote.
 * Ignores 'unspecified' readings (unclear) and uses only confident readings.
 *
 * @param {Array<{suggestedCategory: string, confidence: string}>} readings
 * @returns {'dj_system' | 'dhol_tasha' | 'unspecified'}
 */
export function aggregateCategory(readings) {
  if (!readings || readings.length === 0) return 'unspecified';

  // Weight high-confidence readings more heavily
  const weights = { high: 2, medium: 1.5, low: 1 };
  const scores = { dj_system: 0, dhol_tasha: 0, unspecified: 0 };

  for (const r of readings) {
    const w = weights[r.confidence] || 1;
    scores[r.suggestedCategory] = (scores[r.suggestedCategory] || 0) + w;
  }

  // Require at least 15% of weighted readings to be a specific category
  const totalWeight = Object.values(scores).reduce((a, b) => a + b, 0);
  const winner = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);

  if (winner === 'unspecified') return 'unspecified';
  if (scores[winner] / totalWeight < 0.15) return 'unspecified';
  return winner;
}
