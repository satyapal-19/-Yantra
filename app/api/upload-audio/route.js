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

    // Validate size: reject files > 2MB (60s Opus should be ~120-150 KB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'Audio file too large' }, { status: 413 });
    }

    // ── Vercel Blob Integration (uncomment when BLOB_READ_WRITE_TOKEN is set) ──
    // const { put } = await import('@vercel/blob');
    // const blob = await put(`snippets/${Date.now()}.webm`, file, {
    //   access: 'public',
    //   contentType: 'audio/webm',
    // });
    // return NextResponse.json({ success: true, url: blob.url });

    // ── Placeholder response until Blob storage is configured ──
    return NextResponse.json({
      success: true,
      url: null, // Reports will be saved without audio URL until storage is configured
      message: 'Audio storage not yet configured — report saved without audio proof',
    });
  } catch (error) {
    console.error('[POST /api/upload-audio]', error.message);
    return NextResponse.json({ success: false, error: 'Upload failed' }, { status: 500 });
  }
}
