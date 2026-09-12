import mongoose from 'mongoose';

const NoiseReportSchema = new mongoose.Schema({
  // Anonymous session ID (SHA-256 hashed before storage — not reversible)
  anonymousSessionId: {
    type: String,
    required: true,
  },

  // Sound metrics collected over the 60-second window
  avgDecibel: { type: Number, required: true },
  peakDecibel: { type: Number, required: true },
  violationDurationSeconds: { type: Number, required: true, min: 0, max: 60 },
  clipDurationSeconds: { type: Number, default: 60, min: 1, max: 60 },

  // Classification
  severity: {
    type: String,
    enum: ['normal', 'warning', 'severe'],
    required: true,
  },
  categoryTag: {
    type: String,
    enum: ['dj_system', 'dhol_tasha', 'unspecified'],
    default: 'unspecified',
  },

  // Bass ratio from FFT fingerprinting (DJ/Dhol detection)
  bassRatio: { type: Number, default: null },

  // Zone from CPCB rules
  zoneCategory: {
    type: String,
    enum: ['silence', 'residential', 'commercial', 'industrial'],
    default: 'residential',
  },

  // Legal thresholds at time of recording
  legalLimitApplied: { type: Number },

  // Context at time of recording
  recordedAt: { type: Date, required: true }, // exact IST timestamp
  isNighttime: { type: Boolean, default: false },
  festivalContext: { type: String, default: null }, // e.g. "Public Festival / Event"
  highCourtRelevant: { type: Boolean, default: false },

  // Obfuscated GeoJSON location (50m random jitter applied — raw GPS never stored)
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [obfuscated_lng, obfuscated_lat]
      required: true,
    },
  },

  // Audio proof stored directly in MongoDB (base64 Data URL) and/or streaming URL
  audioData: { type: String, default: null },
  audioSnippetUrl: { type: String, default: null },

  // Admin verification
  verification: {
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },
    verifiedBy: { type: String, default: null }, // e.g. 'admin'
    verifiedAt: { type: Date, default: null },
    adminNotes: { type: String, default: null },
    // Kept for backward compatibility with existing records
    confirmVotes: { type: Number, default: 0 },
    falsePositiveVotes: { type: Number, default: 0 },
    votedSessionHashes: { type: [String], default: [] },
  },

  // TTL: auto-delete after 14 days to stay within free tier
  timestamp: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 14, // 14 days in seconds
  },
});

// 2dsphere index for fast $near and $geoWithin queries
NoiseReportSchema.index({ location: '2dsphere' });
NoiseReportSchema.index({ 'verification.status': 1 });
NoiseReportSchema.index({ timestamp: -1 });

export default mongoose.models.NoiseReport ||
  mongoose.model('NoiseReport', NoiseReportSchema);
