import { NextResponse } from 'next/server';

/**
 * POST /api/upload-audio
 * Accepts a WebM audio blob and returns a URL.
 *
 * Current implementation: returns a placeholder URL.
 * Production: Integrate Vercel Blob Storage or Cloudflare R2 here.
 *
 * To use Vercel Blob:
 *   npm install @vercel/blob
 *   const { put } = await import('@vercel/blob');
 *   const blob = await put(`audio/${Date.now()}.webm`, file, { access: 'public' });
 *   return NextResponse.json({ url: blob.url });
 */
export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('audio');

    if (!file) {
      return NextResponse.json({ success: false, error: 'No audio file provided' }, { status: 400 });
    }

    // Validate size: reject files > 4MB (60s Opus is typically ~120-180 KB)
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'Audio file too large (>4MB)' }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = file.type || 'audio/webm';
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    return NextResponse.json({
      success: true,
      url: dataUrl,
      audioData: dataUrl,
      sizeBytes: buffer.length,
      mimeType,
    });
  } catch (error) {
    console.error('[POST /api/upload-audio]', error.message);
    return NextResponse.json({ success: false, error: 'Upload failed: ' + error.message }, { status: 500 });
  }
}
