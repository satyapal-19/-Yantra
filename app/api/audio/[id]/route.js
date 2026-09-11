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
      const match = rawData.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        return new NextResponse('Invalid audio data format', { status: 500 });
      }

      const mimeType = match[1] || 'audio/webm';
      const base64Data = match[2];
      const buffer = Buffer.from(base64Data, 'base64');

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
