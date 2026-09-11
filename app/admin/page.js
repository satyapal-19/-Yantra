'use client';

import { useState, useEffect, useCallback } from 'react';

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState('');
  const [isAuthed, setIsAuthed] = useState(false);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState({});
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadReports = useCallback(async (key = adminKey, status = filter) => {
    if (!key) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports?key=${encodeURIComponent(key)}&status=${status}`);
      const data = await res.json();
      if (data.success) {
        setReports(data.reports);
        setIsAuthed(true);
        localStorage.setItem('bapat_admin_key', key);
      } else {
        showToast(data.error || 'Authentication failed', 'error');
        if (res.status === 401) setIsAuthed(false);
      }
    } catch (e) {
      showToast('Error connecting to server: ' + e.message, 'error');
    }
    setLoading(false);
  }, [adminKey, filter]);

  useEffect(() => {
    const saved = localStorage.getItem('bapat_admin_key');
    if (saved) {
      setAdminKey(saved);
      loadReports(saved, 'all');
    }
  }, [loadReports]);

  const updateStatus = async (reportId, newStatus) => {
    setActionLoading(prev => ({ ...prev, [reportId]: true }));
    try {
      const res = await fetch('/api/admin/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({ reportId, status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setReports(prev => prev.map(r =>
          r._id === reportId ? { ...r, verification: { ...r.verification, status: newStatus, verifiedBy: 'admin' } } : r
        ));
        showToast(`Report updated to ${newStatus}`);
      } else {
        showToast(data.error || 'Failed to update status', 'error');
      }
    } catch (e) {
      showToast('Error updating status: ' + e.message, 'error');
    }
    setActionLoading(prev => ({ ...prev, [reportId]: false }));
  };

  const deleteReport = async (reportId) => {
    if (!confirm('Are you sure you want to permanently delete this report and clip from MongoDB?')) return;
    try {
      const res = await fetch(`/api/admin/reports?id=${reportId}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey },
      });
      const data = await res.json();
      if (data.success) {
        setReports(prev => prev.filter(r => r._id !== reportId));
        showToast('Report deleted from database');
      } else {
        showToast(data.error || 'Failed to delete report', 'error');
      }
    } catch (e) {
      showToast('Error deleting report', 'error');
    }
  };

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-stone-900 text-stone-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-stone-800 border border-stone-700 rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <span className="text-4xl">🛡️</span>
            <h1 className="text-2xl font-bold text-orange-400 mt-2">बापट यंत्र Admin Panel</h1>
            <p className="text-stone-400 text-xs mt-1">Database Verification & Clip Management</p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); loadReports(adminKey, filter); }} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-300 mb-1">Admin Secret Key</label>
              <input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="Enter ADMIN_SECRET..."
                className="w-full bg-stone-900 border border-stone-700 rounded-xl px-4 py-3 text-sm text-stone-100 focus:outline-none focus:border-orange-500"
                required
              />
              <p className="text-[11px] text-stone-500 mt-1">Default key is configured in .env.local</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-500 font-bold py-3 rounded-xl transition text-sm disabled:opacity-50">
              {loading ? 'Verifying...' : 'Access Admin Dashboard'}
            </button>
          </form>

          {toast && (
            <div className={`mt-4 p-3 rounded-xl text-xs text-center ${toast.type === 'error' ? 'bg-red-900/50 text-red-300 border border-red-800' : 'bg-green-900/50 text-green-300'}`}>
              {toast.msg}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 p-4 md:p-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-xl text-xs shadow-lg font-medium ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-stone-800">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🛡️</span>
            <h1 className="text-2xl md:text-3xl font-bold text-orange-400">बापट यंत्र — Admin Dashboard</h1>
          </div>
          <p className="text-stone-400 text-xs mt-1">
            Direct Database Audio Clip Verification · Connected to MongoDB
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/"
            className="px-4 py-2 rounded-xl border border-stone-700 hover:bg-stone-800 text-xs font-semibold text-stone-300">
            ← View Public App
          </a>
          <button
            onClick={() => { localStorage.removeItem('bapat_admin_key'); setIsAuthed(false); }}
            className="px-4 py-2 rounded-xl bg-red-950 border border-red-800 hover:bg-red-900 text-xs font-semibold text-red-300">
            Logout
          </button>
        </div>
      </header>

      {/* Filter and Stats Toolbar */}
      <div className="max-w-7xl mx-auto my-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {['all', 'pending', 'verified', 'rejected'].map((st) => (
            <button
              key={st}
              onClick={() => { setFilter(st); loadReports(adminKey, st); }}
              className={`px-4 py-2 rounded-xl text-xs font-semibold capitalize transition ${
                filter === st ? 'bg-orange-600 text-white shadow-lg' : 'bg-stone-900 border border-stone-800 text-stone-400 hover:bg-stone-800'
              }`}>
              {st}
            </button>
          ))}
        </div>

        <button
          onClick={() => loadReports(adminKey, filter)}
          className="px-4 py-2 rounded-xl bg-stone-900 border border-stone-800 hover:bg-stone-800 text-xs font-semibold text-orange-400">
          🔄 Refresh DB Records ({reports.length})
        </button>
      </div>

      {/* Reports List */}
      <main className="max-w-7xl mx-auto">
        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-500 border-t-transparent mx-auto mb-3" />
            <p className="text-stone-400 text-sm">Loading database records...</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-20 bg-stone-900/50 border border-stone-800 rounded-3xl">
            <span className="text-4xl">📭</span>
            <p className="text-stone-300 font-semibold mt-3">No records found matching filter "{filter}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reports.map((r) => {
              const status = r.verification?.status || 'pending';
              return (
                <div key={r._id} className="bg-stone-900/90 border border-stone-800 rounded-2xl p-5 flex flex-col justify-between shadow-xl">
                  <div>
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <span className={`inline-block text-[11px] font-bold px-2.5 py-1 rounded-full uppercase ${
                          r.severity === 'severe' ? 'bg-red-950 text-red-400 border border-red-800' :
                          r.severity === 'warning' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                          'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        }`}>
                          {r.severity}
                        </span>
                        <span className="ml-2 text-xs text-stone-400 font-devanagari">
                          {r.categoryTag === 'dj_system' ? '🔊 तीव्र ध्वनी' : r.categoryTag === 'dhol_tasha' ? '🥁 वाद्य ध्वनी' : '❓ आवाज'}
                        </span>
                      </div>

                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full uppercase ${
                        status === 'verified' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                        status === 'rejected' ? 'bg-stone-800 text-stone-400 border border-stone-700' :
                        'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                      }`}>
                        {status}
                      </span>
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-3 gap-2 my-3 text-center">
                      <div className="bg-stone-950 rounded-xl p-2 border border-stone-800/80">
                        <div className="text-base font-bold text-orange-400 font-mono">{r.avgDecibel} dB</div>
                        <div className="text-[10px] text-stone-500">Average Leq</div>
                      </div>
                      <div className="bg-stone-950 rounded-xl p-2 border border-stone-800/80">
                        <div className="text-base font-bold text-red-400 font-mono">{r.peakDecibel} dB</div>
                        <div className="text-[10px] text-stone-500">Peak dB</div>
                      </div>
                      <div className="bg-stone-950 rounded-xl p-2 border border-stone-800/80">
                        <div className="text-base font-bold text-stone-300 font-mono">
                          {r.violationDurationSeconds}s <span className="text-[10px] text-stone-500 font-normal">/ {r.clipDurationSeconds || 60}s</span>
                        </div>
                        <div className="text-[10px] text-stone-500">Violation / Clip</div>
                      </div>
                    </div>

                    {/* Context Details */}
                    <div className="text-xs text-stone-400 space-y-1 mb-4 bg-stone-950/60 p-3 rounded-xl">
                      <div className="flex justify-between">
                        <span>Zone:</span>
                        <span className="text-stone-200 capitalize">{r.zoneCategory}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Time:</span>
                        <span className="text-stone-300">{new Date(r.recordedAt).toLocaleString('en-IN')}</span>
                      </div>
                      {r.festivalContext && (
                        <div className="flex justify-between text-purple-400">
                          <span>Context:</span>
                          <span>{r.festivalContext}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-[11px] text-stone-500 truncate">
                        <span>ID:</span>
                        <span className="font-mono">{r._id}</span>
                      </div>
                    </div>

                    {/* Audio Player */}
                    <div className="my-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-stone-400 font-medium">🎧 Recorded Audio Proof:</span>
                        {r.hasAudio ? (
                          <span className="text-emerald-400 text-[11px] flex items-center gap-1">
                            ✓ In DB {r.audioSizeBytes ? `(${Math.round(r.audioSizeBytes / 1024)} KB)` : ''}
                          </span>
                        ) : (
                          <span className="text-stone-500 text-[11px]">No audio recorded</span>
                        )}
                      </div>

                      {r.hasAudio ? (
                        <div className="space-y-1.5 mt-1">
                          <audio
                            controls
                            className="w-full h-8 rounded-lg accent-orange-500"
                            src={r.audioUrl}
                            preload="metadata"
                          />
                          <div className="flex justify-between items-center text-[10px] text-stone-500 px-1">
                            <span>Recorded Clip: ~{r.clipDurationSeconds || 60}s</span>
                            <a
                              href={r.audioUrl}
                              target="_blank"
                              rel="noreferrer"
                              download={`bapat-audio-${r._id}.webm`}
                              className="text-orange-400 hover:text-orange-300 hover:underline flex items-center gap-0.5">
                              ⬇ Download Clip
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-stone-950 text-stone-500 text-xs p-2 rounded-lg text-center">
                          Clip not available for this record
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Verification Actions */}
                  <div className="pt-3 border-t border-stone-800 space-y-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateStatus(r._id, 'verified')}
                        disabled={actionLoading[r._id] || status === 'verified'}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold py-2 rounded-xl transition">
                        ✓ Verify
                      </button>
                      <button
                        onClick={() => updateStatus(r._id, 'rejected')}
                        disabled={actionLoading[r._id] || status === 'rejected'}
                        className="flex-1 bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-300 text-xs font-bold py-2 rounded-xl transition">
                        ✕ Reject
                      </button>
                      {status !== 'pending' && (
                        <button
                          onClick={() => updateStatus(r._id, 'pending')}
                          disabled={actionLoading[r._id]}
                          className="px-3 bg-stone-800 hover:bg-stone-700 text-amber-400 text-xs font-bold py-2 rounded-xl transition"
                          title="Reset to Pending">
                          ⏳
                        </button>
                      )}
                    </div>

                    <div className="flex justify-between items-center text-[11px] text-stone-500 pt-1">
                      {r.verification?.verifiedBy ? (
                        <span>By {r.verification.verifiedBy} · {new Date(r.verification.verifiedAt).toLocaleDateString()}</span>
                      ) : <span>Pending admin review</span>}
                      <button
                        onClick={() => deleteReport(r._id)}
                        className="text-red-400 hover:text-red-300 underline">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Direct DB verification guide */}
      <footer className="max-w-7xl mx-auto mt-12 p-6 bg-stone-900 border border-stone-800 rounded-3xl text-xs text-stone-400">
        <h3 className="font-bold text-stone-200 text-sm mb-2">💡 Direct MongoDB Verification Instructions</h3>
        <p className="mb-2">
          To verify or update reports directly inside your MongoDB database (Compass / mongosh):
        </p>
        <code className="block bg-stone-950 p-3 rounded-xl font-mono text-orange-300 text-[11px] overflow-x-auto">
          {`db.noisereports.updateOne(
  { _id: ObjectId("<REPORT_ID>") },
  { $set: { "verification.status": "verified", "verification.verifiedBy": "admin", "verification.verifiedAt": new Date() } }
)`}
        </code>
      </footer>
    </div>
  );
}
