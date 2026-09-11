import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import NoiseReport from '@/models/NoiseReport';

function checkAuth(req) {
  const adminSecret = process.env.ADMIN_SECRET || 'bapat-admin-2026';
  const { searchParams } = new URL(req.url);
  const key = req.headers.get('x-admin-key') || searchParams.get('key');
  return key === adminSecret;
}

/**
 * GET /api/admin/reports
 * Fetches all reports with audio status for admin verification.
 */
export async function GET(req) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Invalid admin key' }, { status: 401 });
    }

    await dbConnect();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'all';

    const query = {};
    if (status !== 'all') {
      query['verification.status'] = status;
    }

    const reports = await NoiseReport.find(query)
      .select(
        '_id avgDecibel peakDecibel violationDurationSeconds clipDurationSeconds severity categoryTag ' +
        'zoneCategory location isNighttime festivalContext highCourtRelevant ' +
        'audioSnippetUrl audioData verification recordedAt'
      )
      .sort({ recordedAt: -1 })
      .limit(200)
      .lean();

    // Map reports to include audio streaming link, size, and duration
    const formatted = reports.map(r => {
      let audioBytes = null;
      if (r.audioData && typeof r.audioData === 'string') {
        const markerIdx = r.audioData.indexOf(';base64,');
        if (markerIdx !== -1) {
          audioBytes = Math.round((r.audioData.length - markerIdx - 8) * 0.75);
        }
      }
      return {
        _id: r._id,
        avgDecibel: r.avgDecibel,
        peakDecibel: r.peakDecibel,
        violationDurationSeconds: r.violationDurationSeconds ?? 0,
        clipDurationSeconds: r.clipDurationSeconds || 60,
        severity: r.severity,
        categoryTag: r.categoryTag,
        zoneCategory: r.zoneCategory,
        coordinates: r.location?.coordinates || [],
        isNighttime: r.isNighttime,
        festivalContext: r.festivalContext,
        highCourtRelevant: r.highCourtRelevant,
        recordedAt: r.recordedAt,
        verification: r.verification,
        hasAudio: Boolean(r.audioData || r.audioSnippetUrl),
        audioSizeBytes: audioBytes,
        audioUrl: `/api/audio/${r._id}`,
      };
    });

    return NextResponse.json({ success: true, count: formatted.length, reports: formatted });
  } catch (error) {
    console.error('[GET /api/admin/reports]', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/reports
 * Verify, reject, or reset a report as Admin.
 * Body: { reportId, status, adminNotes }
 */
export async function POST(req) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Invalid admin key' }, { status: 401 });
    }

    await dbConnect();
    const body = await req.json();
    const { reportId, status, adminNotes } = body;

    if (!reportId || !['verified', 'rejected', 'pending'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'reportId and valid status ("verified" | "rejected" | "pending") required' },
        { status: 400 }
      );
    }

    const report = await NoiseReport.findById(reportId);
    if (!report) {
      return NextResponse.json({ success: false, error: 'Report not found' }, { status: 404 });
    }

    report.verification.status = status;
    report.verification.verifiedBy = 'admin';
    report.verification.verifiedAt = new Date();
    if (adminNotes !== undefined) {
      report.verification.adminNotes = adminNotes;
    }

    await report.save();

    return NextResponse.json({
      success: true,
      reportId: report._id,
      status: report.verification.status,
      verifiedBy: report.verification.verifiedBy,
      verifiedAt: report.verification.verifiedAt,
    });
  } catch (error) {
    console.error('[POST /api/admin/reports]', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/reports
 * Delete a report from DB.
 */
export async function DELETE(req) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Invalid admin key' }, { status: 401 });
    }

    await dbConnect();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Report id required' }, { status: 400 });
    }

    await NoiseReport.findByIdAndDelete(id);
    return NextResponse.json({ success: true, message: 'Report deleted successfully' });
  } catch (error) {
    console.error('[DELETE /api/admin/reports]', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
