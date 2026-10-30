import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const bucket = process.env.MINIO_BUCKET ?? "kqa-documents";

const client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
  region: process.env.MINIO_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
  },
});

let bucketReady: Promise<void> | undefined;

async function ensureBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status !== 404) throw error;
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
    })().catch((error) => {
      bucketReady = undefined;
      throw error;
    });
  }
  return bucketReady;
}

export function createDocumentObjectKey(tenantId: string, documentId: string, filename: string) {
  const safeFilename = encodeURIComponent(filename.replace(/[\r\n]/g, ""));
  return `${tenantId}/${documentId}/${safeFilename}`;
}

export function createDocumentObjectUrl(objectKey: string) {
  return `s3://${bucket}/${objectKey}`;
}

export async function uploadDocumentObject(objectKey: string, body: Uint8Array, contentType: string) {
  await ensureBucket();
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: body, ContentType: contentType }));
}

export async function readDocumentObject(objectKey: string) {
  await ensureBucket();
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
  if (!result.Body) throw new Error("文档文件内容不存在");
  return result.Body.transformToByteArray();
}

export async function deleteDocumentObject(objectKey: string) {
  await ensureBucket();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}
