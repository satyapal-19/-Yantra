'use client';

import { useEffect, useRef, useCallback } from 'react';

// NOTE: Leaflet is imported dynamically inside useEffect (not at module level)
// because it uses window/document which don't exist during SSR.
// Even with ssr:false on the dynamic() wrapper, static top-level imports
// of Leaflet can still cause the map to buffer indefinitely in Next.js App Router.

const MAHARASHTRA_CENTER = [19.7515, 75.7139];
const DEFAULT_ZOOM = 7;

function severityColor(severity) {
  if (severity === 'severe') return '#ef4444';
  if (severity === 'warning') return '#f59e0b';
  return '#22c55e';
}

function makePopupHtml(beacon) {
  const timeStr = new Date(beacon.recordedAt).toLocaleString('mr-IN', {
    dateStyle: 'short', timeStyle: 'short',
  });
  const cat = beacon.categoryTag === 'dj_system' ? '🎛️ DJ System'
    : beacon.categoryTag === 'dhol_tasha' ? '🥁 Dhol-Tasha' : '❓ अनिश्चित';
  const verified = beacon.verification?.status === 'verified'
    ? '<span style="color:#16a34a;font-weight:bold">✅ समुदायाने पुष्टी केली</span>'
    : beacon.verification?.status === 'rejected'
    ? '<span style="color:#6b7280">❌ खोटी तक्रार</span>'
    : '<span style="color:#d97706">⏳ तपासणी प्रतीक्षेत</span>';

  return `
    <div style="font-family:'Noto Sans Devanagari',sans-serif;min-width:220px;padding:4px">
      <div style="font-size:18px;font-weight:bold;color:${severityColor(beacon.severity)};margin-bottom:6px">
        ${beacon.severity === 'severe' ? 'गंभीर उल्लंघन 🚨' : beacon.severity === 'warning' ? 'चेतावणी ⚠️' : 'सामान्य'}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
        <div style="background:#fff7ed;border-radius:8px;padding:6px;text-align:center">
          <div style="font-size:20px;font-weight:bold;color:#ea580c">${beacon.avgDecibel}</div>
          <div style="font-size:10px;color:#78716c">सरासरी dB</div>
        </div>
        <div style="background:#fef2f2;border-radius:8px;padding:6px;text-align:center">
          <div style="font-size:20px;font-weight:bold;color:#dc2626">${beacon.peakDecibel}</div>
          <div style="font-size:10px;color:#78716c">शिखर dB</div>
        </div>
      </div>
      <div style="font-size:12px;color:#57534e;margin-bottom:4px">🎵 ${cat}</div>
      <div style="font-size:12px;color:#57534e;margin-bottom:4px">⏱ उल्लंघन: ${beacon.violationDurationSeconds}s / 60s</div>
      ${beacon.isNighttime ? '<div style="font-size:12px;color:#6d28d9;margin-bottom:4px">🌙 रात्रीचे उल्लंघन</div>' : ''}
      ${beacon.festivalContext ? `<div style="font-size:12px;color:#7c3aed;margin-bottom:4px">🎊 ${beacon.festivalContext}</div>` : ''}
      <div style="font-size:11px;margin-bottom:4px">${verified}</div>
      ${beacon.highCourtRelevant ? '<div style="font-size:10px;color:#dc2626;background:#fef2f2;border-radius:4px;padding:3px 6px">⚖️ Bombay HC / NGT संबंधित</div>' : ''}
      ${beacon.audioSnippetUrl ? `
        <audio controls style="width:100%;margin-top:8px;height:28px;accent-color:#f97316" src="${beacon.audioSnippetUrl}"></audio>
      ` : ''}
      <div style="font-size:10px;color:#a8a29e;margin-top:6px">${timeStr}</div>
    </div>
  `;
}

export default function MapView({ onStatsUpdate }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const leafletRef = useRef(null);  // Holds L after dynamic import

  const loadBeacons = useCallback(async () => {
    if (!mapInstanceRef.current) return;

    const center = mapInstanceRef.current.getCenter();
    const url = `/api/beacons?lat=${center.lat}&lng=${center.lng}&radius=150000&status=all`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) return;

      // Clear old markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      const L = leafletRef.current;
      if (!L) return;

      let severe = 0, warning = 0, verified = 0;

      data.beacons.forEach(beacon => {
        const [lng, lat] = beacon.location.coordinates;
        const color = severityColor(beacon.severity);
        const isVerified = beacon.verification?.status === 'verified';
        const isPending = beacon.verification?.status === 'pending';

        // Outer pulse ring
        const pulseIcon = L.divIcon({
          className: '',
          html: `
            <div style="position:relative;width:36px;height:36px">
              <div style="
                position:absolute;inset:0;border-radius:50%;
                background:${color};opacity:0.2;
                animation:beacon-pulse 1.8s ease-out infinite;
              "></div>
              <div style="
                position:absolute;inset:6px;border-radius:50%;
                background:${color};
                border:2px solid white;
                box-shadow:0 2px 8px rgba(0,0,0,0.3);
                display:flex;align-items:center;justify-content:center;
                font-size:11px;color:white;font-weight:bold;
                ${isPending ? 'opacity:0.6' : ''}
              ">
                ${beacon.severity === 'severe' ? '🚨' : beacon.severity === 'warning' ? '⚠️' : '✓'}
              </div>
              ${isVerified ? '<div style="position:absolute;top:-4px;right:-4px;width:14px;height:14px;background:#16a34a;border-radius:50%;border:2px solid white;font-size:8px;display:flex;align-items:center;justify-content:center;color:white">✓</div>' : ''}
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -20],
        });

        const marker = L.marker([lat, lng], { icon: pulseIcon })
          .bindPopup(makePopupHtml(beacon), {
            maxWidth: 260,
            className: 'bapat-popup',
          });

        marker.addTo(mapInstanceRef.current);
        markersRef.current.push(marker);

        if (beacon.severity === 'severe') severe++;
        else if (beacon.severity === 'warning') warning++;
        if (isVerified) verified++;
      });

      if (onStatsUpdate) {
        onStatsUpdate({ severe, warning, verified, total: data.count });
      }
    } catch (e) {
      console.error('Failed to load beacons', e);
    }
  }, [onStatsUpdate]);


  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    let cancelled = false;
    let mapInstance = null;

    // Dynamically import Leaflet + CSS only on the client (avoids SSR/bundler issues)
    async function initMap() {
      const L = (await import('leaflet')).default;
      leafletRef.current = L;  // Store for use in loadBeacons

      // Inject Leaflet CSS dynamically so it doesn't go through SSR
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        link.crossOrigin = '';
        document.head.appendChild(link);
      }

      // Fix default icon paths broken by Webpack
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // Abort if cleanup already ran (StrictMode double-invoke guard)
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;

      mapInstance = L.map(mapRef.current, {
        center: MAHARASHTRA_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: true,
      });
      mapInstanceRef.current = mapInstance;

      // OpenStreetMap tiles (free, no API key)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(mapInstance);

      mapInstance.on('moveend', loadBeacons);

      // Center on user location if available
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.setView([pos.coords.latitude, pos.coords.longitude], 13);
            }
            loadBeacons();
          },
          () => loadBeacons()
        );
      } else {
        loadBeacons();
      }
    }

    initMap().catch(console.error);

    return () => {
      cancelled = true;  // Prevent async initMap from proceeding after cleanup
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [loadBeacons]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />
      {/* Map overlay controls */}
      <div className="absolute top-3 right-3 z-[999] flex flex-col gap-2">
        <button onClick={loadBeacons}
          className="glass-card border border-orange-200 px-3 py-2 rounded-xl text-xs font-devanagari text-orange-700 hover:bg-orange-50 shadow-sm transition-all">
          🔄 नकाशा ताजा करा
        </button>
      </div>
    </div>
  );
}
