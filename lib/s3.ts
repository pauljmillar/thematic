import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// Lazy-load S3 client to ensure env vars are loaded first
let s3Client: S3Client | null = null;
let bucketName: string | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!region) {
      throw new Error('AWS_REGION environment variable is not set');
    }
    if (!accessKeyId) {
      throw new Error('AWS_ACCESS_KEY_ID environment variable is not set');
    }
    if (!secretAccessKey) {
      throw new Error('AWS_SECRET_ACCESS_KEY environment variable is not set');
    }

    // Validate credentials aren't empty
    if (accessKeyId.trim().length === 0) {
      throw new Error('AWS_ACCESS_KEY_ID is empty');
    }
    if (secretAccessKey.trim().length === 0) {
      throw new Error('AWS_SECRET_ACCESS_KEY is empty');
    }

    console.log(`  → Using AWS credentials: ${accessKeyId.substring(0, 8)}... (region: ${region})`);

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
  if (!bucketName) {
    const name = process.env.AWS_S3_BUCKET_NAME;
    if (!name) {
      throw new Error('AWS_S3_BUCKET_NAME environment variable is not set');
    }
    if (name.trim().length === 0) {
      throw new Error('AWS_S3_BUCKET_NAME is empty');
    }
    bucketName = name.trim();
  }
  return bucketName;
}

export async function uploadToS3(imagePath: string): Promise<string> {
  try {
    const client = getS3Client();
    const bucket = getBucketName();
    const region = process.env.AWS_REGION!;

    const fileContent = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath);
    const fileName = `${randomUUID()}${ext}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: fileName,
      Body: fileContent,
      ContentType: `image/${ext.slice(1).toLowerCase() === 'jpg' ? 'jpeg' : ext.slice(1).toLowerCase()}`,
      // Note: ACL removed - bucket should use bucket policies for public access
      // If your bucket has ACLs enabled, you can add: ACL: 'public-read'
    });

    await client.send(command);

    // Construct public URL
    const url = `https://${bucket}.s3.${region}.amazonaws.com/${fileName}`;
    return url;
  } catch (error) {
    console.error('Error uploading to S3:', error);
    
    // Provide more helpful error messages
    if (error instanceof Error) {
      if (error.message.includes('credential') || error.message.includes('credentials')) {
        throw new Error(
          `S3 credentials error: ${error.message}\n` +
          `Please verify:\n` +
          `  1. AWS_ACCESS_KEY_ID is set and correct\n` +
          `  2. AWS_SECRET_ACCESS_KEY is set and correct\n` +
          `  3. AWS_REGION is set correctly (e.g., us-west-2)\n` +
          `  4. The credentials have S3 upload permissions\n` +
          `  5. There are no extra spaces or quotes in .env.local`
        );
      }
      if (error.message.includes('bucket') || error.message.includes('Bucket') || error.message.includes('ACL')) {
        let additionalHelp = '';
        if (error.message.includes('ACL')) {
          additionalHelp = `\n\n💡 ACL Error Solution:\n` +
            `Your bucket has ACLs disabled (common for newer buckets).\n` +
            `To make images publicly accessible, add a bucket policy:\n\n` +
            `1. Go to S3 Console → Your Bucket → Permissions → Bucket Policy\n` +
            `2. Add this policy (replace 'your-bucket-name'):\n\n` +
            `{\n` +
            `  "Version": "2012-10-17",\n` +
            `  "Statement": [\n` +
            `    {\n` +
            `      "Sid": "PublicReadGetObject",\n` +
            `      "Effect": "Allow",\n` +
            `      "Principal": "*",\n` +
            `      "Action": "s3:GetObject",\n` +
            `      "Resource": "arn:aws:s3:::your-bucket-name/*"\n` +
            `    }\n` +
            `  ]\n` +
            `}\n\n` +
            `3. Also ensure "Block public access" settings allow public access if needed.`;
        }
        throw new Error(
          `S3 bucket error: ${error.message}\n` +
          `Please verify:\n` +
          `  1. AWS_S3_BUCKET_NAME is set correctly\n` +
          `  2. The bucket exists in the specified region\n` +
          `  3. The credentials have access to this bucket` +
          additionalHelp
        );
      }
      throw new Error(`Failed to upload to S3: ${error.message}`);
    }
    throw new Error(`Failed to upload to S3: Unknown error`);
  }
}
