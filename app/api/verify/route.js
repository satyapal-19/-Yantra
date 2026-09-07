import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import dbConnect from '@/lib/dbConnect';
import NoiseReport from '@/models/NoiseReport';

/**
 * POST /api/verify
 * Community verification vote for a noise report.
 *
 * Body: { reportId, vote, voterSessionId }
 * vote: 'confirm' | 'false_positive'
 *
 * Rules:
 * - Reporter cannot vote on their own report
 * - Each anonymous session can only vote once per report
 * - 3 confirm votes → status: 'verified'
 * - 3 false_positive votes → status: 'rejected'
 */
export async function POST(req) {
  try {
    await dbConnect();

    const { reportId, vote, voterSessionId } = await req.json();

    if (!reportId || !vote || !voterSessionId) {
      return NextResponse.json(
        { success: false, error: 'reportId, vote, and voterSessionId are required' },
        { status: 400 }
      );
    }

    if (!['confirm', 'false_positive'].includes(vote)) {
      return NextResponse.json(
        { success: false, error: 'vote must be "confirm" or "false_positive"' },
        { status: 400 }
      );
    }

    // Hash the voter's session ID using the same salt
    const salt = process.env.SESSION_SALT || 'dhwani-default-salt';
    const hashedVoterSession = createHash('sha256')
      .update(voterSessionId + salt)
      .digest('hex');

    const report = await NoiseReport.findById(reportId);
    if (!report) {
      return NextResponse.json(
        { success: false, error: 'Report not found' },
        { status: 404 }
      );
    }

    // Block if already resolved
    if (report.verification.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `This report has already been ${report.verification.status}` },
        { status: 409 }
      );
    }

    // Block self-voting and duplicate voting
    if (
      report.anonymousSessionId === hashedVoterSession ||
      report.verification.votedSessionHashes.includes(hashedVoterSession)
    ) {
      return NextResponse.json(
        { success: false, error: 'You have already voted on this report or it is your own submission.' },
        { status: 403 }
      );
    }

    // Apply vote
    if (vote === 'confirm') {
      report.verification.confirmVotes += 1;
    } else {
      report.verification.falsePositiveVotes += 1;
    }

    report.verification.votedSessionHashes.push(hashedVoterSession);

    // Status transition thresholds
    const VERIFY_THRESHOLD = 3;
    const REJECT_THRESHOLD = 3;

    if (report.verification.confirmVotes >= VERIFY_THRESHOLD) {
      report.verification.status = 'verified';
    } else if (report.verification.falsePositiveVotes >= REJECT_THRESHOLD) {
      report.verification.status = 'rejected';
    }

    await report.save();

    return NextResponse.json({
      success: true,
      newStatus: report.verification.status,
      confirmVotes: report.verification.confirmVotes,
      falsePositiveVotes: report.verification.falsePositiveVotes,
    });
  } catch (error) {
    console.error('[POST /api/verify]', error.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/verify
 * Fetches pending reports for community verification,
 * sorted by highest decibel and filtered by location.
 *
 * Query params:
 *   lat    - User's latitude
 *   lng    - User's longitude
 *   radius - Search radius in meters (default: 15000 = 15km)
 */
export async function GET(req) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const lat = parseFloat(searchParams.get('lat'));
    const lng = parseFloat(searchParams.get('lng'));
    const radius = parseInt(searchParams.get('radius')) || 15000;

    const query = {
      'verification.status': 'pending',
    };

    // Geo-filter if location is provided
    if (!isNaN(lat) && !isNaN(lng)) {
      query.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radius,
        },
      };
    }

    const pendingReports = await NoiseReport.find(query)
      .select(
        '_id avgDecibel peakDecibel violationDurationSeconds severity categoryTag ' +
        'zoneCategory isNighttime festivalContext highCourtRelevant ' +
        'audioSnippetUrl verification.confirmVotes verification.falsePositiveVotes recordedAt'
      )
      .sort({ peakDecibel: -1, recordedAt: 1 }) // Highest peak first, oldest first
      .limit(20)
      .lean();

    return NextResponse.json({
      success: true,
      count: pendingReports.length,
      reports: pendingReports,
    });
  } catch (error) {
    console.error('[GET /api/verify]', error.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
