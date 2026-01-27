/**
 * Converts an S3 URL to a proxy URL that generates temporary signed URLs
 * 
 * Example:
 * Input:  https://thematic-images.s3.us-west-2.amazonaws.com/8357004f-be67-45f4-9f20-93f3ec90c72b.jpeg
 * Output: /api/images/8357004f-be67-45f4-9f20-93f3ec90c72b.jpeg
 */
export function getProxyImageUrl(s3Url: string | null | undefined): string | null {
  if (!s3Url) return null;

  try {
    // Parse the S3 URL to extract the key
    // Format: https://bucket-name.s3.region.amazonaws.com/key
    // Or: https://bucket-name.s3-region.amazonaws.com/key
    const url = new URL(s3Url);
    
    // Extract the key (everything after the domain)
    const pathname = url.pathname;
    
    // Remove leading slash
    const key = pathname.startsWith('/') ? pathname.slice(1) : pathname;
    
    if (!key) {
      console.warn('Could not extract S3 key from URL:', s3Url);
      return null;
    }

    // Return the proxy URL
    return `/api/images/${key}`;
  } catch (error) {
    console.error('Error parsing S3 URL:', s3Url, error);
    return null;
  }
}
