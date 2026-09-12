import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import NoiseReport from '@/models/NoiseReport';

/**
 * GET /api/beacons
 * Fetches noise report beacons for the map.
 *
 * Query params:
 *   lat       - Center latitude (required)
 *   lng       - Center longitude (required)
 *   radius    - Search radius in meters (default: 10000 = 10km)
 *   status    - Filter by verification status: 'pending' | 'verified' | 'all' (default: 'all')
 *   severity  - Filter: 'warning' | 'severe' | 'all' (default: 'all')
 */
export async function GET(req) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const lat = parseFloat(searchParams.get('lat'));
    const lng = parseFloat(searchParams.get('lng'));
    const radius = parseInt(searchParams.get('radius')) || 10000;
    const statusFilter = searchParams.get('status') || 'all';
    const severityFilter = searchParams.get('severity') || 'all';

    const hasCoords = !isNaN(lat) && !isNaN(lng);

    // Build MongoDB query
    const query = {};

    if (hasCoords) {
      query.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radius,
        },
      };
    }

    if (statusFilter !== 'all') {
      query['verification.status'] = statusFilter;
    }

    if (severityFilter !== 'all') {
      query.severity = severityFilter;
    }

    // Project only the fields needed for the map — never expose session IDs
    const beacons = await NoiseReport.find(query)
      .select(
        '_id avgDecibel peakDecibel violationDurationSeconds severity categoryTag ' +
        'zoneCategory location isNighttime festivalContext highCourtRelevant ' +
        'verification.status verification.confirmVotes verification.falsePositiveVotes ' +
        'audioSnippetUrl recordedAt'
      )
      .limit(200)
      .lean();
    const sanitizedBeacons = beacons.map(b => ({
      ...b,
      festivalContext: (b.festivalContext && !/ganesh|गणेश/i.test(b.festivalContext)) ? b.festivalContext : null,
    }));

    return NextResponse.json({ success: true, count: sanitizedBeacons.length, beacons: sanitizedBeacons });
  } catch (error) {
    console.error('[GET /api/beacons]', error.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
