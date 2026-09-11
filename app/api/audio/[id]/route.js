import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import NoiseReport from '@/models/NoiseReport';

/**
 * GET /api/audio/[id]
 * Streams the audio snippet stored in MongoDB directly to the client.
 */
export async function GET(req, { params }) {
  try {
    await dbConnect();

    const { id } = await params;
    if (!id) {
      return new NextResponse('Report ID required', { status: 400 });
    }

    const report = await NoiseReport.findById(id).select('audioData audioSnippetUrl');
    if (!report) {
      return new NextResponse('Report not found', { status: 404 });
    }

    const rawData = report.audioData || report.audioSnippetUrl;
    if (!rawData || typeof rawData !== 'string') {
      return new NextResponse('No audio recorded for this report', { status: 404 });
    }

    // Handle base64 Data URL (e.g. data:audio/webm;codecs=opus;base64,...)
    if (rawData.startsWith('data:')) {
      const base64Marker = ';base64,';
      const markerIdx = rawData.indexOf(base64Marker);
      if (markerIdx === -1) {
        return new NextResponse('Invalid audio data format', { status: 500 });
      }

      const mimeType = rawData.substring(5, markerIdx) || 'audio/webm';
      const base64Data = rawData.substring(markerIdx + base64Marker.length);
      const buffer = Buffer.from(base64Data, 'base64');

      // Support Range requests (essential for audio seeking & duration reading on browsers)
      const rangeHeader = req.headers.get('range');
      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? parseInt(parts[1], 10) : buffer.length - 1;
        const chunksize = (end - start) + 1;
        const sliced = buffer.subarray(start, end + 1);

        return new Response(sliced, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Type': mimeType,
          },
        });
      }

      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': buffer.length.toString(),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=604800, immutable',
        },
      });
    }

    // If it's a remote URL, redirect
    if (rawData.startsWith('http://') || rawData.startsWith('https://')) {
      return NextResponse.redirect(rawData);
    }

    return new NextResponse('Unsupported audio format', { status: 500 });
  } catch (error) {
    console.error('[GET /api/audio/[id]]', error.message);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
