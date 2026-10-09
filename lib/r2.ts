import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY!,
  },
})

/** Storage keys always start with the owner's user id: `${userId}/...`. */
export function userFileKey(userId: string, ...parts: string[]): string {
  return [userId, ...parts].join('/')
}

export async function uploadToR2(key: string, buffer: Buffer, contentType: string) {
  await r2Client.send(new PutObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }))
  return key
}

/**
 * Short-lived download URL. Callers must have verified that the key belongs
 * to the requesting user (key prefix + Document.userId).
 */
export async function getSignedDownloadUrl(key: string, expiresInSeconds = 300) {
  return getSignedUrl(r2Client, new GetObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET!,
    Key: key,
  }), { expiresIn: expiresInSeconds })
}

/** Deletes objects in batches of 1000. Returns the number of keys that failed. */
export async function deleteFromR2(keys: string[]): Promise<number> {
  let failed = 0
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000)
    try {
      const res = await r2Client.send(new DeleteObjectsCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET!,
        Delete: { Objects: batch.map(Key => ({ Key })), Quiet: true },
      }))
      failed += res.Errors?.length ?? 0
    } catch {
      failed += batch.length
    }
  }
  return failed
}
