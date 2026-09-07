import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import dbConnect from '@/lib/dbConnect';
import NoiseReport from '@/models/NoiseReport';
import { obfuscateCoordinates } from '@/utils/geoObfuscator';
import { getLegalLimit, classifySeverity } from '@/utils/noiseThresholds';
import { getViolationContext } from '@/utils/contextEngine';

export async function POST(req) {
  try {
    await dbConnect();

    const body = await req.json();
    const {
      anonymousSessionId,
      avgDecibel,
      peakDecibel,
      violationDurationSeconds,
      zoneCategory,
      latitude,  // Raw GPS — will NOT be stored
      longitude, // Raw GPS — will NOT be stored
      audioSnippetUrl,
      bassRatio,
      suggestedCategory,
    } = body;

    // --- Validate required fields ---
    if (
      !anonymousSessionId ||
      avgDecibel == null ||
      peakDecibel == null ||
      violationDurationSeconds == null ||
      latitude == null ||
      longitude == null
    ) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // --- Discard 'normal' reports (< 20s violation) — anti-spam ---
    const severity = classifySeverity(violationDurationSeconds);
    if (severity === 'normal') {
      return NextResponse.json(
        { success: false, error: 'Noise level did not sustain long enough to qualify as a violation.' },
        { status: 200 } // Not an error, just insufficient
      );
    }

    // --- Hash the session ID for privacy (SHA-256 + server salt) ---
    const salt = process.env.SESSION_SALT || 'dhwani-default-salt';
    const hashedSessionId = createHash('sha256')
      .update(anonymousSessionId + salt)
      .digest('hex');

    // --- Obfuscate location (50m random offset) — raw coords discarded ---
    const { latitude: obsLat, longitude: obsLng } = obfuscateCoordinates(
      parseFloat(latitude),
      parseFloat(longitude),
      50
    );

    // --- Get legal limit and violation context ---
    const zone = zoneCategory || 'residential';
    const now = new Date();
    const legalLimit = getLegalLimit(zone, now);
    const context = getViolationContext(avgDecibel, zone, now);

    // --- Create the report ---
    const newReport = await NoiseReport.create({
      anonymousSessionId: hashedSessionId,
      avgDecibel: Math.round(avgDecibel),
      peakDecibel: Math.round(peakDecibel),
      violationDurationSeconds,
      severity,
      categoryTag: suggestedCategory || 'unspecified',
      bassRatio: bassRatio || null,
      zoneCategory: zone,
      legalLimitApplied: legalLimit,
      recordedAt: now,
      isNighttime: context.isNighttime,
      festivalContext: context.festivalContext,
      highCourtRelevant: context.highCourtRelevant,
      location: {
        type: 'Point',
        coordinates: [obsLng, obsLat], // GeoJSON: [lng, lat]
      },
      audioSnippetUrl: audioSnippetUrl || null,
    });

    return NextResponse.json(
      {
        success: true,
        reportId: newReport._id,
        severity,
        context,
        legalLimit,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[POST /api/report]', error.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
