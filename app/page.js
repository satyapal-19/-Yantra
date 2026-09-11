'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { getLegalLimit, classifySeverity, SEVERITY_LABELS, ZONE_LABELS } from '@/utils/noiseThresholds';
import { classifyNoiseProbability, aggregateCategory } from '@/utils/frequencyClassifier';
import { DecibelMeter, getCalibrationOffset } from '@/utils/decibelMeter';

// ── Leaflet map loaded client-side only (no SSR) ──────────────────────────────
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false, loading: () => (
  <div className="w-full h-full flex items-center justify-center bg-amber-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-500 border-t-transparent mx-auto mb-3" />
      <p className="font-devanagari text-orange-600">नकाशा लोड होत आहे...</p>
    </div>
  </div>
)});

// ── Marathi content ───────────────────────────────────────────────────────────
const MARATHI_QUOTES = [
  { text: 'तीव्र कर्कश आवाज, आजाराला निमंत्रण.', sub: 'Loud Noise Invites Illness' },
  { text: 'शांततेचा अधिकार हा आपला मूलभूत हक्क आहे.', sub: 'Peace is Your Fundamental Right' },
  { text: 'अवाजाचे उल्लंघन, कायद्याचे उल्लंघन.', sub: 'Sound Violation is Law Violation' },
  { text: 'आपल्या महाराष्ट्राला शांत करूया.', sub: "Let's Make Maharashtra Peaceful" },
  { text: 'ध्वनी प्रदूषण थांबवा, आरोग्य वाचवा.', sub: 'Stop Noise Pollution, Save Health' },
];

const FLOATING_CHARS = ['ॐ', '🔔', '🎵', '🌸', '✦', '◈', '🪘'];

const ZONE_OPTIONS = [
  { value: 'residential', label: 'निवासी क्षेत्र', sub: 'Residential (55 dB day / 45 dB night)' },
  { value: 'commercial',  label: 'व्यावसायिक क्षेत्र', sub: 'Commercial (65 dB day / 55 dB night)' },
  { value: 'silence',     label: 'शांतता क्षेत्र', sub: 'Silence Zone (50 dB day / 40 dB night)' },
  { value: 'industrial',  label: 'औद्योगिक क्षेत्र', sub: 'Industrial (75 dB day / 70 dB night)' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getOrCreateSessionId() {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('bapat_session_id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('bapat_session_id', id); }
  return id;
}

function dbColor(db) {
  if (db >= 80) return '#ef4444';
  if (db >= 65) return '#f97316';
  if (db >= 50) return '#f59e0b';
  return '#22c55e';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FloatingParticles() {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    char: FLOATING_CHARS[i % FLOATING_CHARS.length],
    left: `${5 + i * 8}%`,
    delay: `${i * 0.5}s`,
    duration: `${3 + (i % 3)}s`,
    size: i % 3 === 0 ? 'text-2xl' : 'text-base',
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <span
          key={p.id}
          className={`absolute bottom-0 opacity-60 ${p.size} animate-float-up`}
          style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration }}
        >
          {p.char}
        </span>
      ))}
    </div>
  );
}

function MandalaDecor({ size = 300, className = '' }) {
  return (
    <div className={`absolute pointer-events-none ${className}`} style={{ width: size, height: size }}>
      <div className="mandala-ring animate-spin-slow w-full h-full absolute" />
      <div className="mandala-ring animate-spin-slow-reverse absolute"
        style={{ inset: '10%', borderColor: 'rgba(251,191,36,0.3)' }} />
      <div className="mandala-ring absolute" style={{ inset: '20%', borderColor: 'rgba(249,115,22,0.2)', borderStyle: 'solid' }} />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-4xl opacity-20 font-devanagari">ॐ</span>
      </div>
    </div>
  );
}

function QuoteCarousel() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % MARATHI_QUOTES.length), 4000);
    return () => clearInterval(t);
  }, []);
  const q = MARATHI_QUOTES[idx];
  return (
    <div className="text-center min-h-[80px]">
      <p key={idx} className="font-devanagari text-2xl md:text-3xl text-orange-700 animate-fade-slide-up leading-relaxed">
        "{q.text}"
      </p>
      <p className="text-sm text-orange-400 mt-1 font-display italic">{q.sub}</p>
    </div>
  );
}

function DbGauge({ leq, instantDb, limit, stats }) {
  const mainDb = leq || instantDb || 0;
  const pct = Math.min(100, (mainDb / 120) * 100);
  const color = dbColor(mainDb);
  const r = 58;
  const C = 2 * Math.PI * r;
  // Background grey arc spans full circle, orange arc spans actual level
  const dash = (pct / 100) * C;

  // Limit marker angle
  const limitAngle = ((limit / 120) * 360) - 90; // degrees from top
  const limitRad = (limitAngle * Math.PI) / 180;
  const lx = 70 + r * Math.cos(limitRad);
  const ly = 70 + r * Math.sin(limitRad);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Circular gauge */}
      <div className="relative">
        <svg width="150" height="150" viewBox="0 0 140 140">
          {/* Background track */}
          <circle cx="70" cy="70" r={r} fill="none" stroke="#fed7aa" strokeWidth="10" />
          {/* Level arc */}
          <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={`${dash} ${C}`} strokeLinecap="round"
            transform="rotate(-90 70 70)"
            style={{ transition: 'stroke-dasharray 0.25s ease, stroke 0.3s ease' }} />
          {/* Legal limit tick mark */}
          <line
            x1={70 + (r - 8) * Math.cos(limitRad)}
            y1={70 + (r - 8) * Math.sin(limitRad)}
            x2={70 + (r + 8) * Math.cos(limitRad)}
            y2={70 + (r + 8) * Math.sin(limitRad)}
            stroke="#dc2626" strokeWidth="3" strokeLinecap="round"
            transform="rotate(-90 70 70)"
            style={{ transformOrigin: '70px 70px' }} />

          {/* Leq label top */}
          <text x="70" y="52" textAnchor="middle" fill="#78716c" fontSize="9" fontWeight="600" letterSpacing="1">
            Leq dB(A)
          </text>
          {/* Main Leq number */}
          <text x="70" y="76" textAnchor="middle" fill={color} fontSize="30" fontWeight="bold" fontFamily="monospace">
            {mainDb || '--'}
          </text>
          {/* Instant dB secondary */}
          {instantDb && instantDb !== mainDb && (
            <text x="70" y="91" textAnchor="middle" fill="#92400e" fontSize="11" fontFamily="monospace">
              ↑ {instantDb} inst.
            </text>
          )}
          {/* Limit label */}
          <text x="70" y="106" textAnchor="middle" fill="#c2410c" fontSize="10">
            Limit: {limit} dB
          </text>
        </svg>

        {/* Violation color ring pulse when over limit */}
        {mainDb > limit && (
          <div className="absolute inset-0 rounded-full animate-ping opacity-20"
            style={{ background: `radial-gradient(circle, ${color}, transparent)` }} />
        )}
      </div>

      {/* L10 / L50 / L90 stats strip */}
      {stats && (stats.L10 > 0 || stats.L90 > 0) && (
        <div className="grid grid-cols-3 gap-2 w-full text-center">
          {[
            { label: 'L10', value: stats.L10, title: 'Dominant', color: '#ef4444' },
            { label: 'L50', value: stats.L50, title: 'Median', color: '#f97316' },
            { label: 'L90', value: stats.L90, title: 'Background', color: '#22c55e' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-2 border border-orange-100 shadow-sm">
              <div className="text-base font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs text-stone-400 font-mono">{s.label}</div>
              <div className="text-xs text-stone-300">{s.title}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function WaveVisualizer({ active }) {
  if (!active) return (
    <div className="flex items-end gap-1 h-12 opacity-20">
      {[8,12,6,14,10].map((h,i) => <div key={i} className="wave-bar" style={{ height: h }} />)}
    </div>
  );
  return (
    <div className="flex items-end gap-1 h-12">
      {[1,2,3,4,5].map(i => <div key={i} className="wave-bar" />)}
    </div>
  );
}

// ── Noise Recorder Component ──────────────────────────────────────────────────
function NoiseRecorder({ onReportSubmitted }) {
  const [phase, setPhase] = useState('idle');
  const [zone, setZone] = useState('residential');
  const [elapsed, setElapsed] = useState(0);

  // Live display state
  const [leqDb, setLeqDb] = useState(0);
  const [instantDb, setInstantDb] = useState(0);
  const [stats, setStats] = useState({ L10: 0, L50: 0, L90: 0, peak: 0 });
  const [noiseFloor, setNoiseFloor] = useState(null);
  const [bandLevels, setBandLevels] = useState({ subBass: 0, bass: 0, mid: 0, high: 0 });

  const [violationSeconds, setViolationSeconds] = useState(0);
  const [severity, setSeverity] = useState('normal');
  const [category, setCategory] = useState('unspecified');
  const [fundamentalHz, setFundamentalHz] = useState(null);
  const [result, setResult] = useState(null);
  const [browserWarning, setBrowserWarning] = useState(false);

  // Refs for audio engine
  const audioCtxRef       = useRef(null);
  const meterRef          = useRef(null);   // DecibelMeter instance
  const intervalRef       = useRef(null);   // 1-second main tick
  const fastIntervalRef   = useRef(null);   // 250ms fast display update
  const mediaRecorderRef  = useRef(null);
  const chunksRef         = useRef([]);
  const secondReadingsRef = useRef([]);
  const violationSecondsRef = useRef(0);    // Ref for async access in finishRecording

  const limit = getLegalLimit(zone, new Date());

  const startRecording = useCallback(async () => {
    setPhase('requesting');
    try {
      // ── Guard: mediaDevices only works on localhost or HTTPS ────────────────
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          'मायक्रोफोन उपलब्ध नाही. कृपया localhost वर उघडा किंवा HTTPS वापरा.\n' +
          '(Microphone blocked: open via localhost or HTTPS, not via network IP)'
        );
      }

      // ── 1. Request raw microphone stream ────────────────────────────────────
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: 44100,
        },
      });

      // Check if constraints were honored
      const track = stream.getAudioTracks()[0];
      const settings = track.getSettings();
      if (settings.autoGainControl !== false || settings.noiseSuppression !== false) {
        setBrowserWarning(true);
      }

      // ── 2. Build AudioContext + DecibelMeter ────────────────────────────────
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 44100,
      });

      // Resume context (required after user gesture on some browsers)
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }

      // Create meter with 8192-point FFT for high frequency resolution
      // (~5.4 Hz per bin at 44100 Hz sample rate)
      const calibration = getCalibrationOffset();
      meterRef.current = new DecibelMeter(audioCtxRef.current, 8192, calibration);

      const source = audioCtxRef.current.createMediaStreamSource(stream);
      meterRef.current.connect(source);

      // ── 3. Setup MediaRecorder ──────────────────────────────────────────────
      chunksRef.current = [];
      secondReadingsRef.current = [];
      violationSecondsRef.current = 0;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current.start(1000);

      // ── 4. Reset display state ──────────────────────────────────────────────
      setPhase('recording');
      setElapsed(0);
      setLeqDb(0);
      setInstantDb(0);
      setViolationSeconds(0);
      setSeverity('normal');
      setNoiseFloor(null);
      setStats({ L10: 0, L50: 0, L90: 0, peak: 0 });
      setBandLevels({ subBass: 0, bass: 0, mid: 0, high: 0 });

      // ── 5. Fast display update (250ms) — smooth UI animation ───────────────
      // This only updates the visual display, does NOT affect Leq computation
      fastIntervalRef.current = setInterval(() => {
        if (!meterRef.current) return;
        const idb = Math.round(meterRef.current.getInstantaneousDB());
        setInstantDb(idb);
        const bands = meterRef.current.getBandLevels();
        setBandLevels(bands);
      }, 250);

      // ── 6. Main 1-second measurement tick ──────────────────────────────────
      intervalRef.current = setInterval(() => {
        if (!meterRef.current) return;

        // Take a formal Leq sample (A-weighted)
        const reading = meterRef.current.sample();
        const currentLeq = reading.leq;
        const currentStats = meterRef.current.getStatistics();

        // FFT-based classification
        const cls = classifyNoiseProbability(
          meterRef.current.node,
          audioCtxRef.current
        );
        secondReadingsRef.current.push(cls);

        // Update noise floor display
        if (reading.noiseFloor !== null) setNoiseFloor(reading.noiseFloor);

        // Update display
        setLeqDb(currentLeq);
        setStats(currentStats);
        if (cls.fundamentalHz > 0) setFundamentalHz(Math.round(cls.fundamentalHz));

        // Violation check (against Leq — legally correct metric)
        setViolationSeconds(prev => {
          const isViolation = currentLeq > limit;
          const newCount = isViolation ? prev + 1 : prev;
          violationSecondsRef.current = newCount;
          setSeverity(classifySeverity(newCount));
          return newCount;
        });

        // Elapsed counter
        setElapsed(prev => {
          const next = prev + 1;
          if (next >= 60) {
            clearInterval(intervalRef.current);
            clearInterval(fastIntervalRef.current);
            finishRecording(stream);
          }
          return next;
        });
      }, 1000);

    } catch (err) {
      console.error('[NoiseRecorder]', err);
      setPhase('error');
      setResult({ message: err.name === 'NotAllowedError'
        ? 'मायक्रोफोन परवानगी नाकारली. कृपया ब्राउझरमध्ये अनुमती द्या.'
        : `त्रुटी: ${err.message}` });
    }
  }, [zone, limit]);

  const finishRecording = useCallback((stream) => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }

    setTimeout(async () => {
      const meter = meterRef.current;
      const finalLeq    = meter ? meter.getLeq() : 0;
      const finalStats  = meter ? meter.getStatistics() : { L10: 0, L50: 0, L90: 0, peak: 0 };
      const finalSev    = classifySeverity(violationSecondsRef.current);
      const finalCat    = aggregateCategory(secondReadingsRef.current);

      setCategory(finalCat);
      if (meter) meter.destroy();

      if (finalSev === 'normal') {
        setResult({ severity: 'normal', message: 'सामान्य ध्वनी पातळी — उल्लंघन नाही.' });
        setPhase('done');
        if (stream) stream.getTracks().forEach(t => t.stop());
        return;
      }

      setPhase('submitting');
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, {
            enableHighAccuracy: true,
            timeout: 8000,
          })
        );

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        let audioUrl = null;
        try {
          const fd = new FormData();
          fd.append('audio', blob, 'snippet.webm');
          const upRes = await fetch('/api/upload-audio', { method: 'POST', body: fd });
          if (upRes.ok) { const j = await upRes.json(); audioUrl = j.url; }
        } catch (_) { /* audio upload is optional */ }

        const body = {
          anonymousSessionId: getOrCreateSessionId(),
          // Report Leq (legally correct) as avgDecibel, L10 as peakDecibel
          avgDecibel: finalLeq,
          peakDecibel: finalStats.peak || finalLeq,
          violationDurationSeconds: violationSecondsRef.current,
          zoneCategory: zone,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          audioSnippetUrl: audioUrl,
          bassRatio: secondReadingsRef.current[0]?.bassRatio || null,
          suggestedCategory: finalCat,
        };

        const res = await fetch('/api/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();

        if (data.success) {
          setResult({
            ...data,
            leq: finalLeq,
            l10: finalStats.L10,
            l90: finalStats.L90,
            peak: finalStats.peak,
            vSec: violationSecondsRef.current,
            finalCategory: finalCat,
          });
          setPhase('done');
          if (onReportSubmitted) onReportSubmitted();
        } else {
          setResult({ message: data.error || 'सबमिशन अयशस्वी.' });
          setPhase('error');
        }
      } catch (err) {
        setResult({ message: 'स्थान मिळवणे शक्य नाही किंवा नेटवर्क त्रुटी.' });
        setPhase('error');
      }
      if (stream) stream.getTracks().forEach(t => t.stop());
    }, 1200);
  }, [zone, onReportSubmitted]);

  const reset = () => {
    setPhase('idle');
    setElapsed(0);
    setLeqDb(0);
    setInstantDb(0);
    setViolationSeconds(0);
    setSeverity('normal');
    setResult(null);
    setBrowserWarning(false);
    setStats({ L10: 0, L50: 0, L90: 0, peak: 0 });
    setNoiseFloor(null);
    violationSecondsRef.current = 0;
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (fastIntervalRef.current) clearInterval(fastIntervalRef.current);
    if (meterRef.current) { meterRef.current.destroy(); meterRef.current = null; }
  };



  const progressPct = (elapsed / 60) * 100;
  const violationPct = Math.round((violationSeconds / 60) * 100);
  const sev = SEVERITY_LABELS[severity];

  return (
    <div id="record" className="py-20 px-4 bg-gradient-to-b from-amber-50 to-orange-50">
      <div className="max-w-2xl mx-auto">
        {/* Section heading */}
        <div className="text-center mb-10">
          <div className="lotus-divider mb-4">
            <span className="font-devanagari text-3xl font-bold text-orange-700 mx-4">ध्वनी नोंद करा</span>
          </div>
          <p className="text-stone-500 font-display italic">Record Noise — 60 Second Scan</p>
        </div>

        {/* Zone selector */}
        {phase === 'idle' && (
          <div className="glass-card rounded-2xl p-6 mb-6 animate-fade-slide-up">
            <label className="block font-devanagari text-lg text-orange-800 mb-3 font-semibold">
              तुमचे क्षेत्र निवडा <span className="text-sm font-sans text-stone-400">(Select your zone)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ZONE_OPTIONS.map(z => (
                <button key={z.value}
                  onClick={() => setZone(z.value)}
                  className={`rounded-xl p-3 text-left border-2 transition-all ${zone === z.value
                    ? 'border-orange-500 bg-orange-50 shadow-md'
                    : 'border-orange-200 bg-white hover:border-orange-400'}`}>
                  <div className="font-devanagari font-semibold text-orange-800">{z.label}</div>
                  <div className="text-xs text-stone-400 mt-0.5">{z.sub}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Browser warning */}
        {browserWarning && (
          <div className="bg-amber-100 border border-amber-400 rounded-xl p-3 mb-4 text-sm text-amber-800 flex gap-2">
            <span>⚠️</span>
            <span>तुमचा ब्राउझर ऑटो-गेन बंद करू शकला नाही. सर्वोत्तम परिणामांसाठी Android Chrome वापरा.
            <span className="italic ml-1">(Browser may produce less accurate dB readings)</span></span>
          </div>
        )}

        {/* Recorder Card */}
        <div className="glass-card rounded-3xl p-8 shadow-xl border border-orange-200 animate-glow-pulse">

          {/* IDLE STATE */}
          {phase === 'idle' && (
            <div className="text-center space-y-6">
              <div className="relative mx-auto w-40 h-40">
                <MandalaDecor size={160} className="top-0 left-0" />
                <div className="relative z-10 w-full h-full flex items-center justify-center">
                  <span className="text-7xl">🎙️</span>
                </div>
              </div>
              <div>
                <p className="font-devanagari text-2xl text-orange-700 font-bold">
                  ६० सेकंद ध्वनी तपासणी
                </p>
                <p className="text-stone-400 text-sm mt-1">60-second acoustic noise violation analysis</p>
              </div>
              <button onClick={startRecording}
                className="btn-primary text-white font-devanagari text-xl px-10 py-4 rounded-full font-bold tracking-wide">
                🔴 रेकॉर्डिंग सुरू करा
              </button>
              <p className="text-xs text-stone-400">Microphone + Location access required • No login needed</p>
            </div>
          )}

          {/* REQUESTING */}
          {phase === 'requesting' && (
            <div className="text-center py-8 space-y-4">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-orange-500 border-t-transparent mx-auto" />
              <p className="font-devanagari text-xl text-orange-700">मायक्रोफोन परवानगी मागत आहे...</p>
              <p className="text-stone-400 text-sm">Requesting microphone permission...</p>
            </div>
          )}

          {/* RECORDING */}
          {phase === 'recording' && (
            <div className="space-y-5">
              {/* Timer + dB in a two-column layout */}
              <div className="flex items-start justify-center gap-6">
                {/* Timer progress ring */}
                <div className="relative flex-shrink-0">
                  <svg width="130" height="130" viewBox="0 0 160 160">
                    <circle cx="80" cy="80" r="70" fill="none" stroke="#fed7aa" strokeWidth="8" />
                    <circle cx="80" cy="80" r="70" fill="none" stroke="#f97316" strokeWidth="8"
                      strokeDasharray={`${(progressPct / 100) * 440} 440`}
                      strokeLinecap="round" transform="rotate(-90 80 80)"
                      style={{ transition: 'stroke-dasharray 0.8s ease' }} />
                    <text x="80" y="72" textAnchor="middle" fill="#ea580c" fontSize="34" fontWeight="bold" fontFamily="monospace">
                      {60 - elapsed}
                    </text>
                    <text x="80" y="90" textAnchor="middle" fill="#92400e" fontSize="11">
                      seconds left
                    </text>
                    <text x="80" y="105" textAnchor="middle" fill="#c2410c" fontSize="10">
                      {elapsed > 0 ? `${elapsed}s recorded` : 'starting...'}
                    </text>
                  </svg>
                  <div className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
                </div>

                {/* dB Gauge with Leq, instant, and L10/L50/L90 */}
                <div className="flex-1">
                  <DbGauge leq={leqDb} instantDb={instantDb} limit={limit} stats={elapsed >= 5 ? stats : null} />
                </div>
              </div>

              {/* Frequency band visualizer bars */}
              <div className="bg-white rounded-2xl p-4 border border-orange-100">
                <p className="text-xs text-stone-400 mb-2 text-center">आवाज आवृत्ती विश्लेषण — Frequency Band Analysis</p>
                <div className="flex items-end gap-2 h-14 justify-center">
                  {[
                    { label: 'Sub Bass\n20–120Hz', value: bandLevels.subBass, note: 'Low Bass' },
                    { label: 'Bass\n120–500Hz', value: bandLevels.bass, note: 'Harmonics' },
                    { label: 'Mid\n500Hz–2kHz', value: bandLevels.mid, note: 'Speech' },
                    { label: 'High\n2–8kHz', value: bandLevels.high, note: 'Treble' },
                  ].map((b, i) => (
                    <div key={i} className="flex flex-col items-center flex-1 gap-1">
                      <div className="w-full rounded-t-lg transition-all duration-300"
                        style={{
                          height: `${Math.max(4, (b.value / 100) * 56)}px`,
                          background: i < 2
                            ? `rgba(239,68,68,${0.4 + (b.value / 100) * 0.6})`
                            : `rgba(249,115,22,${0.3 + (b.value / 100) * 0.5})`,
                        }} />
                      <span className="text-xs text-stone-400 whitespace-pre-line text-center leading-none" style={{ fontSize: '9px' }}>{b.label}</span>
                    </div>
                  ))}
                </div>
                {fundamentalHz && (
                  <p className="text-center text-xs text-orange-600 mt-2">
                    🎵 मूल आवृत्ती: <strong>{fundamentalHz} Hz</strong>
                    {fundamentalHz > 60 && fundamentalHz < 200 ? ' — Low Bass Range' : ''}
                  </p>
                )}
              </div>

              {/* Wave visualizer + noise floor */}
              <div className="flex items-center justify-between px-2">
                <div className="flex justify-center">
                  <WaveVisualizer active />
                </div>
                {noiseFloor !== null && (
                  <div className="text-xs text-stone-400 text-right">
                    <span className="text-green-600 font-mono font-bold">{noiseFloor} dB</span>
                    <br />पार्श्वभूमी आवाज<br/>Background
                  </div>
                )}
              </div>

              {/* Violation counter */}
              <div className={`rounded-2xl p-4 text-center ${
                severity === 'severe' ? 'bg-red-50 border border-red-200' :
                severity === 'warning' ? 'bg-amber-50 border border-amber-200' :
                'bg-green-50 border border-green-200'}`}>
                <p className="font-devanagari text-lg font-bold" style={{ color: sev.color }}>
                  {sev.mr}
                </p>
                <p className="text-sm text-stone-500 mt-1">
                  मर्यादेपेक्षा जास्त Leq: <strong>{violationSeconds}s</strong> / 60s
                  <span className="ml-2 text-orange-600">({violationPct}%)</span>
                </p>
                <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-1000"
                    style={{ width: `${violationPct}%`, background: sev.color }} />
                </div>
                <p className="text-xs text-stone-400 mt-1">
                  {violationSeconds < 20 ? '20s वर Warning • ' : ''}
                  {violationSeconds < 40 ? '40s वर Severe' : '🔴 Severe Violation detected!'}
                </p>
              </div>

              {/* Category */}
              <div className="text-center text-sm text-stone-500">
                आवाज प्रकार: <span className="font-bold text-orange-700">
                  {category === 'dj_system' ? '🔊 तीव्र ध्वनी प्रणाली' :
                   category === 'dhol_tasha' ? '🥁 वाद्य ध्वनी' : '❓ ओळखत आहे...'}
                </span>
                <span className="text-xs text-stone-300 ml-2">(A-weighted Leq dB(A))</span>
              </div>
            </div>
          )}

          {/* SUBMITTING */}
          {phase === 'submitting' && (
            <div className="text-center py-10 space-y-4">
              <div className="relative mx-auto w-24 h-24">
                <div className="animate-spin rounded-full h-24 w-24 border-4 border-orange-500 border-t-transparent" />
                <div className="absolute inset-0 flex items-center justify-center text-3xl">📡</div>
              </div>
              <p className="font-devanagari text-xl text-orange-700">नोंद पाठवत आहे...</p>
              <p className="text-stone-400 text-sm">Uploading report securely · Location obfuscated · No identity stored</p>
            </div>
          )}

          {/* DONE */}
          {phase === 'done' && result && (
            <div className="text-center space-y-5">
              {result.severity === 'normal' ? (
                <>
                  <div className="text-6xl">✅</div>
                  <p className="font-devanagari text-2xl text-green-700 font-bold">{result.message}</p>
                  <p className="text-stone-400 text-sm">No sustained violation detected. Thank you for checking!</p>
                </>
              ) : (
                <>
                  <div className="text-6xl animate-bounce">🚨</div>
                  <p className="font-devanagari text-2xl text-red-700 font-bold">
                    {result.severity === 'severe' ? 'गंभीर ध्वनी उल्लंघन नोंदवले!' : 'ध्वनी चेतावणी नोंदवली!'}
                  </p>
                  <div className="glass-card rounded-2xl p-4 text-left space-y-2 text-sm">
                    {/* Leq — legally mandated metric */}
                    <div className="flex justify-between items-center border-b border-orange-100 pb-2 mb-1">
                      <span className="text-stone-500">
                        Leq dB(A) <span className="text-xs text-orange-300">(CPCB legal metric)</span>
                      </span>
                      <span className="font-bold text-orange-700 font-mono text-lg">{result.leq} dB</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-red-50 rounded-lg p-2">
                        <div className="font-bold text-red-600 font-mono">{result.l10 || '—'}</div>
                        <div className="text-xs text-stone-400">L10 (Peak)</div>
                      </div>
                      <div className="bg-orange-50 rounded-lg p-2">
                        <div className="font-bold text-orange-600 font-mono">{result.leq || '—'}</div>
                        <div className="text-xs text-stone-400">Leq (Legal)</div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-2">
                        <div className="font-bold text-green-600 font-mono">{result.l90 || '—'}</div>
                        <div className="text-xs text-stone-400">L90 (Floor)</div>
                      </div>
                    </div>
                    <div className="flex justify-between"><span className="text-stone-500">उच्चतम dB(A)</span><span className="font-bold text-red-600 font-mono">{result.peak} dB</span></div>
                    <div className="flex justify-between"><span className="text-stone-500">उल्लंघन कालावधी</span><span className="font-bold text-orange-700">{result.vSec}s / 60s</span></div>
                    <div className="flex justify-between"><span className="text-stone-500">श्रेणी</span>
                      <span className="font-bold text-orange-700">
                        {result.finalCategory === 'dj_system' ? '🔊 तीव्र ध्वनी प्रणाली' :
                         result.finalCategory === 'dhol_tasha' ? '🥁 वाद्य ध्वनी' : '❓ अनिश्चित'}
                      </span>
                    </div>
                    {result.context?.festivalContext && (
                      <div className="flex justify-between"><span className="text-stone-500">उत्सव संदर्भ</span><span className="font-bold text-purple-700">{result.context.festivalContext}</span></div>
                    )}
                    {result.context?.highCourtRelevant && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-red-700 text-xs font-devanagari">
                        ⚖️ हे उल्लंघन उच्च न्यायालयासाठी संबंधित आहे (Bombay HC / NGT relevant)
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-green-600">✓ नकाशावर बीकन जोडला गेला · स्थान ५० मीटर अस्पष्ट केले · ओळख संरक्षित</p>
                </>
              )}

              <button onClick={reset}
                className="btn-primary text-white font-devanagari px-8 py-3 rounded-full font-semibold mt-2">
                पुन्हा तपासा
              </button>
            </div>
          )}

          {/* ERROR */}
          {phase === 'error' && (
            <div className="text-center space-y-4 py-6">
              <div className="text-5xl">⚠️</div>
              <p className="font-devanagari text-xl text-red-700">{result?.message || 'काहीतरी चुकले.'}</p>
              <button onClick={reset} className="btn-primary text-white px-6 py-2 rounded-full text-sm">पुन्हा प्रयत्न करा</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Verify Feed Component ─────────────────────────────────────────────────────
function VerifyFeed() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [voting, setVoting] = useState({});
  const [voteFeedback, setVoteFeedback] = useState({});
  const [played, setPlayed] = useState({});
  const [locationError, setLocationError] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/verify?radius=25000';
      if (navigator.geolocation) {
        try {
          const pos = await new Promise((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 })
          );
          url = `/api/verify?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&radius=25000`;
        } catch { setLocationError(true); }
      }
      const r = await fetch(url);
      const d = await r.json();
      if (d.success) setReports(d.reports || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  const vote = async (reportId, v) => {
    setVoting(prev => ({ ...prev, [reportId]: v }));
    setVoteFeedback(prev => ({ ...prev, [reportId]: null }));
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, vote: v, voterSessionId: getOrCreateSessionId() }),
      });
      const d = await res.json();
      if (d.success) {
        setReports(prev => prev.map(r =>
          r._id === reportId ? {
            ...r,
            verification: {
              ...r.verification,
              status: d.newStatus,
              confirmVotes: d.confirmVotes,
              falsePositiveVotes: d.falsePositiveVotes,
            }
          } : r
        ));
        setVoteFeedback(prev => ({
          ...prev,
          [reportId]: { type: 'success', msg: 'आपले मत यशस्वीरित्या नोंदवले गेले आहे! (Vote recorded)' }
        }));
      } else {
        const errorMsg = d.error?.includes('already voted') || d.error?.includes('own submission')
          ? 'तुम्ही आधीच मत नोंदवले आहे किंवा हा तुमचा स्वतःचा अहवाल आहे. (Already voted or own report)'
          : (d.error || 'मत नोंदवण्यात त्रुटी आली. कृपया पुन्हा प्रयत्न करा.');
        setVoteFeedback(prev => ({
          ...prev,
          [reportId]: { type: 'error', msg: errorMsg }
        }));
      }
    } catch (err) {
      console.error(err);
      setVoteFeedback(prev => ({
        ...prev,
        [reportId]: { type: 'error', msg: 'इंटरनेट किंवा सर्व्हर त्रुटी. कृपया पुन्हा प्रयत्न करा.' }
      }));
    } finally {
      setTimeout(() => setVoting(prev => { const n = {...prev}; delete n[reportId]; return n; }), 1000);
    }
  };

  return (
    <div id="verify" className="py-20 px-4 bg-gradient-to-b from-orange-50 to-amber-100">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <div className="lotus-divider mb-4">
            <span className="font-devanagari text-3xl font-bold text-orange-700 mx-4">तपासणी करा</span>
          </div>
          <p className="text-stone-500 font-display italic">Community Verification — Listen & Vote</p>
          <p className="font-devanagari text-sm text-orange-600 mt-2">
            खालील ऑडिओ ऐका आणि ध्वनी मर्यादेचे उल्लंघन आहे का ते सांगा
          </p>
        </div>

        {locationError && (
          <div className="bg-amber-100 border border-amber-300 rounded-xl p-3 mb-4 text-sm text-amber-800 font-devanagari">
            📍 स्थान उपलब्ध नाही — महाराष्ट्रातील सर्व अहवाल दाखवत आहे.
          </div>
        )}

        {loading && (
          <div className="text-center py-10">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-orange-500 border-t-transparent mx-auto mb-3" />
            <p className="font-devanagari text-orange-600">अहवाल लोड होत आहेत...</p>
          </div>
        )}

        {!loading && reports.length === 0 && (
          <div className="glass-card rounded-2xl p-10 text-center border border-orange-200">
            <div className="text-5xl mb-4">🌸</div>
            <p className="font-devanagari text-xl text-orange-700">सध्या तपासणीसाठी कोणतेही अहवाल नाहीत.</p>
            <p className="text-stone-400 text-sm mt-2">No pending reports in your area right now.</p>
            <button onClick={loadReports} className="btn-primary text-white px-6 py-2 rounded-full text-sm mt-4">
              पुन्हा तपासा
            </button>
          </div>
        )}

        <div className="space-y-4">
          {reports.map((report, i) => {
            const sev = SEVERITY_LABELS[report.severity] || SEVERITY_LABELS.normal;
            const isVoting = voting[report._id];
            const resolved = report.verification?.status && report.verification?.status !== 'pending';
            return (
              <div key={report._id}
                className="glass-card rounded-2xl p-5 border border-orange-200 shadow-md"
                style={{ animationDelay: `${i * 0.1}s` }}>
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-full mr-2
                      ${report.severity === 'severe' ? 'badge-severe' : report.severity === 'warning' ? 'badge-warning' : 'badge-normal'}`}>
                      {sev.mr}
                    </span>
                    {report.categoryTag !== 'unspecified' && (
                      <span className="inline-block text-xs px-3 py-1 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                        {report.categoryTag === 'dj_system' ? '🔊 तीव्र ध्वनी प्रणाली' : '🥁 वाद्य ध्वनी'}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-stone-400">
                    {new Date(report.recordedAt).toLocaleTimeString('mr-IN', { hour: '2-digit', minute: '2-digit' })}
                    {report.isNighttime && <span className="ml-1 text-indigo-500">🌙</span>}
                  </span>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'सरासरी dB', value: `${report.avgDecibel} dB`, color: dbColor(report.avgDecibel) },
                    { label: 'शिखर dB', value: `${report.peakDecibel} dB`, color: dbColor(report.peakDecibel) },
                    { label: 'उल्लंघन', value: `${report.violationDurationSeconds}s`, color: sev.color },
                  ].map(m => (
                    <div key={m.label} className="bg-white rounded-xl p-3 text-center border border-orange-100">
                      <div className="text-lg font-bold" style={{ color: m.color }}>{m.value}</div>
                      <div className="text-xs text-stone-400 font-devanagari">{m.label}</div>
                    </div>
                  ))}
                </div>

                {/* Festival context */}
                {report.festivalContext && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 mb-3 text-xs text-purple-700 font-devanagari">
                    🎊 {report.festivalContext} उत्सव काळातील उल्लंघन
                  </div>
                )}

                {/* Audio player */}
                {report.audioSnippetUrl && (
                  <div className="mb-4">
                    <audio controls className="w-full h-8 rounded-lg accent-orange-500"
                      src={report.audioSnippetUrl}
                      onPlay={() => setPlayed(p => ({ ...p, [report._id]: true }))} />
                    {!played[report._id] && (
                      <p className="text-xs text-orange-500 mt-1 font-devanagari">⬆ ऑडिओ ऐकल्यानंतर मत द्या</p>
                    )}
                  </div>
                )}

                {/* Vote buttons */}
                {resolved ? (
                  <div className={`text-center py-2 rounded-xl text-sm font-bold font-devanagari
                    ${report.verification.status === 'verified' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {report.verification.status === 'verified' ? '✅ समुदायाने पुष्टी केली' : '❌ खोटी तक्रार म्हणून चिन्हांकित'}
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button onClick={() => vote(report._id, 'confirm')}
                      disabled={!!isVoting}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white font-devanagari font-bold py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                      {isVoting === 'confirm' ? '✓ मत नोंदवत आहे...' : <><span>🔴</span> होय, उल्लंघन आहे</>}
                    </button>
                    <button onClick={() => vote(report._id, 'false_positive')}
                      disabled={!!isVoting}
                      className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-devanagari font-bold py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                      {isVoting === 'false_positive' ? '✓ नोंदवत आहे...' : <><span>✅</span> नाही, सामान्य आवाज</>}
                    </button>
                  </div>
                )}

                {/* Vote Feedback Alert */}
                {voteFeedback[report._id] && (
                  <div className={`mt-3 p-2.5 rounded-xl text-xs font-devanagari text-center font-medium ${
                    voteFeedback[report._id].type === 'success'
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}>
                    {voteFeedback[report._id].msg}
                  </div>
                )}

                {/* Vote counts */}
                <div className="flex justify-end gap-3 mt-2 text-xs text-stone-400">
                  <span>✅ {report.verification?.confirmVotes || 0} पुष्टी</span>
                  <span>❌ {report.verification?.falsePositiveVotes || 0} खोटे</span>
                </div>
              </div>
            );
          })}
        </div>

        {reports.length > 0 && (
          <div className="text-center mt-6">
            <button onClick={loadReports} className="btn-primary text-white font-devanagari px-8 py-3 rounded-full font-semibold">
              नवीन अहवाल लोड करा
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────
function StatsBar({ stats }) {
  const items = [
    { icon: '🔴', value: stats.severe, label: 'गंभीर उल्लंघने', sub: 'Severe Violations' },
    { icon: '🟡', value: stats.warning, label: 'चेतावण्या', sub: 'Warnings' },
    { icon: '✅', value: stats.verified, label: 'पुष्टी झालेले', sub: 'Community Verified' },
    { icon: '📍', value: stats.total, label: 'एकूण नोंदी', sub: 'Total Reports' },
  ];
  return (
    <div className="bg-gradient-to-r from-orange-600 to-amber-500 py-8 px-4">
      <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map(item => (
          <div key={item.label} className="text-center text-white">
            <div className="text-3xl mb-1">{item.icon}</div>
            <div className="text-3xl font-bold font-display">{item.value ?? '—'}</div>
            <div className="font-devanagari text-sm opacity-90">{item.label}</div>
            <div className="text-xs opacity-70">{item.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [mapKey, setMapKey] = useState(0);
  const [stats, setStats] = useState({ severe: 0, warning: 0, verified: 0, total: 0 });

  const refreshMap = useCallback(() => setMapKey(k => k + 1), []);

  // Scroll helpers
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="min-h-screen">

      {/* ── NAVBAR ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card border-b border-orange-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center text-white font-bold text-lg shadow">
              ब
            </div>
            <div>
              <div className="font-devanagari text-xl font-bold text-orange-700 leading-tight">बापट यंत्र</div>
              <div className="text-xs text-stone-400 leading-tight">Maharashtra Noise Reporter</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-devanagari">
            <button onClick={() => scrollTo('hero')} className="text-stone-600 hover:text-orange-600 transition-colors">मुखपृष्ठ</button>
            <button onClick={() => scrollTo('map')} className="text-stone-600 hover:text-orange-600 transition-colors">नकाशा</button>
            <button onClick={() => scrollTo('record')} className="text-stone-600 hover:text-orange-600 transition-colors">नोंद करा</button>
            <button onClick={() => scrollTo('verify')} className="text-stone-600 hover:text-orange-600 transition-colors">तपासा</button>
          </div>
          <button onClick={() => scrollTo('record')}
            className="btn-primary text-white font-devanagari px-4 py-2 rounded-full text-sm font-semibold">
            🎙️ आवाज नोंदवा
          </button>
        </div>
      </nav>

      {/* ── HERO SECTION ── */}
      <section id="hero" className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20"
        style={{ background: 'linear-gradient(160deg, #fff7ed 0%, #fed7aa 40%, #ffedd5 100%)' }}>
        <FloatingParticles />

        {/* Decorative mandalas */}
        <MandalaDecor size={400} className="-top-20 -left-20 opacity-30" />
        <MandalaDecor size={300} className="-bottom-10 -right-10 opacity-20" />

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          {/* Main title */}
          <div className="mb-6 animate-fade-slide-up">
            <h1 className="font-devanagari text-7xl md:text-9xl font-bold shimmer-text leading-none">
              बापट यंत्र
            </h1>
            <div className="flex items-center justify-center gap-3 mt-3">
              <div className="h-px bg-gradient-to-r from-transparent to-orange-400 w-20" />
              <p className="font-display text-lg text-orange-600 italic tracking-widest">
                Maharashtra Noise Pollution Reporter
              </p>
              <div className="h-px bg-gradient-to-l from-transparent to-orange-400 w-20" />
            </div>
          </div>

          {/* Rotating quote carousel */}
          <div className="my-10 px-4">
            <QuoteCarousel />
          </div>

          {/* Decorative om separator */}
          <div className="my-6 flex items-center justify-center gap-4 text-orange-300">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-orange-300" />
            <span className="font-devanagari text-3xl text-orange-500 opacity-60">॥</span>
            <span className="text-sm font-devanagari text-orange-600 opacity-80">तीव्र ध्वनी · ध्वनी मर्यादा उल्लंघन</span>
            <span className="font-devanagari text-3xl text-orange-500 opacity-60">॥</span>
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-orange-300" />
          </div>

          {/* How it works — 3 steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-10">
            {[
              { step: '१', icon: '🎙️', title: '६० सेकंद ऐका', sub: 'Hold your phone toward the noise source' },
              { step: '२', icon: '📊', title: 'आपोआप विश्लेषण', sub: 'Acoustic violation detected via frequency analysis' },
              { step: '३', icon: '📍', title: 'नकाशावर नोंद', sub: 'Location obfuscated — your identity protected' },
            ].map(s => (
              <div key={s.step} className="glass-card rounded-2xl p-5 border border-orange-200 hover:border-orange-400 transition-all hover:-translate-y-1">
                <div className="text-4xl mb-2">{s.icon}</div>
                <div className="w-7 h-7 rounded-full bg-orange-500 text-white font-devanagari font-bold text-sm flex items-center justify-center mx-auto mb-2">
                  {s.step}
                </div>
                <p className="font-devanagari font-bold text-orange-800 text-lg">{s.title}</p>
                <p className="text-stone-400 text-xs mt-1">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button onClick={() => scrollTo('record')}
              className="btn-primary text-white font-devanagari text-xl px-10 py-4 rounded-full font-bold shadow-xl w-full sm:w-auto">
              🔴 आवाज नोंदवा — Record Now
            </button>
            <button onClick={() => scrollTo('map')}
              className="bg-white border-2 border-orange-400 text-orange-700 font-devanagari text-xl px-10 py-4 rounded-full font-bold hover:bg-orange-50 transition-all w-full sm:w-auto">
              🗺️ नकाशा पाहा — View Map
            </button>
          </div>

          {/* Privacy note */}
          <p className="mt-8 text-sm text-stone-400 font-devanagari">
            🔒 कोणतीही नोंदणी नाही · स्थान ५० मी. अस्पष्ट · ओळख संरक्षित
          </p>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 animate-bounce text-orange-400">
          <span className="text-xs font-devanagari">खाली स्क्रोल करा</span>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <StatsBar stats={stats} />

      {/* ── MAP SECTION ── */}
      <section id="map" className="py-16 px-4 bg-amber-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <div className="lotus-divider mb-4">
              <span className="font-devanagari text-3xl font-bold text-orange-700 mx-4">ध्वनी प्रदूषण नकाशा</span>
            </div>
            <p className="text-stone-500 font-display italic">Live Noise Pollution Map — Maharashtra</p>
            <div className="flex items-center justify-center gap-6 mt-4 text-sm">
              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />गंभीर उल्लंघन</span>
              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />चेतावणी</span>
              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-orange-300 inline-block animate-ping" />अपुष्ट</span>
            </div>
          </div>

          <div className="glass-card rounded-3xl overflow-hidden border-2 border-orange-200 shadow-2xl"
            style={{ height: '520px' }}>
            <MapView key={mapKey} onStatsUpdate={setStats} />
          </div>
        </div>
      </section>

      {/* ── RECORDER SECTION ── */}
      <NoiseRecorder onReportSubmitted={refreshMap} />

      {/* ── VERIFY FEED ── */}
      <VerifyFeed />

      {/* ── INFO SECTION ── */}
      <section className="py-16 px-4 bg-gradient-to-b from-amber-100 to-orange-50">
        <div className="max-w-4xl mx-auto">
          <div className="lotus-divider mb-10">
            <span className="font-devanagari text-2xl font-bold text-orange-700 mx-4">कायदेशीर माहिती</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Legal limits */}
            <div className="glass-card rounded-2xl p-6 border border-orange-200">
              <h3 className="font-devanagari text-xl font-bold text-orange-800 mb-4">⚖️ भारतीय कायदेशीर मर्यादा</h3>
              <p className="text-xs text-stone-400 mb-3">Noise Pollution (Regulation & Control) Rules, 2000 — Schedule</p>
              <div className="space-y-2">
                {[
                  { zone: 'शांतता क्षेत्र', day: 50, night: 40 },
                  { zone: 'निवासी क्षेत्र', day: 55, night: 45 },
                  { zone: 'व्यावसायिक क्षेत्र', day: 65, night: 55 },
                  { zone: 'औद्योगिक क्षेत्र', day: 75, night: 70 },
                ].map(r => (
                  <div key={r.zone} className="flex items-center justify-between py-2 border-b border-orange-100 last:border-0">
                    <span className="font-devanagari text-stone-700">{r.zone}</span>
                    <div className="flex gap-3 text-xs">
                      <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded-full">☀️ {r.day} dB</span>
                      <span className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded-full">🌙 {r.night} dB</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Complaint resources */}
            <div className="glass-card rounded-2xl p-6 border border-orange-200">
              <h3 className="font-devanagari text-xl font-bold text-orange-800 mb-4">📞 तक्रार कुठे करावी?</h3>
              <div className="space-y-3">
                {[
                  { icon: '🏛️', label: 'MPCB हेल्पलाइन', val: '1800-233-4555', sub: 'Maharashtra Pollution Control Board' },
                  { icon: '👮', label: 'पोलीस हेल्पलाइन', val: '100 / 112', sub: 'Emergency & Non-Emergency' },
                  { icon: '⚖️', label: 'राष्ट्रीय हरित न्यायाधिकरण', val: 'ngtonline.nic.in', sub: 'National Green Tribunal' },
                  { icon: '🐦', label: 'मुंबई पोलीस', val: '@MumbaiPolice', sub: 'Twitter/X Direct Message' },
                ].map(c => (
                  <div key={c.label} className="flex items-start gap-3 py-2 border-b border-orange-100 last:border-0">
                    <span className="text-2xl">{c.icon}</span>
                    <div>
                      <div className="font-devanagari font-semibold text-stone-700">{c.label}</div>
                      <div className="text-orange-600 font-bold text-sm">{c.val}</div>
                      <div className="text-xs text-stone-400">{c.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-stone-900 text-amber-100 py-10 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="font-devanagari text-4xl shimmer-text font-bold">बापट यंत्र</div>
          <p className="font-devanagari text-orange-300 text-lg">
            "ध्वनी प्रदूषण थांबवा, महाराष्ट्र वाचवा"
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-stone-400">
            <span>🔒 Anonymous Platform</span>
            <span>·</span>
            <span>📍 50m Location Obfuscation</span>
            <span>·</span>
            <span>⚖️ CPCB Rules, 2000</span>
            <span>·</span>
            <span>🆓 Free & Open Source</span>
          </div>
          <p className="text-xs text-stone-600">
            Built for Maharashtra Citizens · Sound & Noise Violation Reporting · Data auto-deleted after 14 days
          </p>
        </div>
      </footer>
    </div>
  );
}
