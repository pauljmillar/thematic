import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Lazy-load S3 client
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not configured');
    }

    s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: accessKeyId.trim(),
        secretAccessKey: secretAccessKey.trim(),
      },
    });
  }
  return s3Client;
}

function getBucketName(): string {
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET_NAME not configured');
  }
  return bucket.trim();
}

/**
 * Proxy endpoint for S3 images
 * Generates temporary signed URLs (valid for 1 hour)
 * 
 * Usage: /api/images/[s3-key]
 * Example: /api/images/8357004f-be67-45f4-9f20-93f3ec90c72b.jpeg
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const resolvedParams = await params;
    // Reconstruct the S3 key from the path array
    const s3Key = resolvedParams.path.join('/');
    
    if (!s3Key) {
      return NextResponse.json(
        { error: 'Image key is required' },
        { status: 400 }
      );
    }

    const client = getS3Client();
    const bucket = getBucketName();

    // Generate a presigned URL (valid for 1 hour)
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    const signedUrl = await getSignedUrl(client, command, {
      expiresIn: 3600, // 1 hour
    });

    // Redirect to the signed URL
    return NextResponse.redirect(signedUrl);
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate image URL',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
