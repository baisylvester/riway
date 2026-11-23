import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { ProviderNotConfigured } from "./production-integrations";
import { imageExtension } from "../lib/files";

const keySchema = z
  .string()
  .regex(/^(PH|SG|MY)\/[0-9a-f-]{36}\.(png|jpg|webp)$/);
export class R2EditorialStorage {
  constructor(
    private readonly client: Pick<S3Client, "send">,
    private readonly bucket: string,
  ) {}
  async put(key: string, bytes: Uint8Array, contentType: string) {
    keySchema.parse(key);
    if (
      bytes.byteLength < 1 ||
      bytes.byteLength > 3145728 ||
      !["image/png", "image/jpeg", "image/webp"].includes(contentType)
    )
      throw new Error("Invalid editorial image.");
    const extension = imageExtension(bytes);
    if (
      !extension ||
      !key.endsWith(`.${extension}`) ||
      { png: "image/png", jpg: "image/jpeg", webp: "image/webp" }[extension] !==
        contentType
    )
      throw new Error("Image bytes do not match the declared type.");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: "private, no-store",
        IfNoneMatch: "*",
      }),
    );
  }
  async preview(key: string) {
    keySchema.parse(key);
    return getSignedUrl(
      this.client as S3Client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseCacheControl: "private, no-store",
      }),
      { expiresIn: 60 },
    );
  }
  async remove(key: string) {
    keySchema.parse(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

export function r2Storage() {
  const {
    R2_ACCOUNT_ID: account,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
    R2_BUCKET: bucket,
  } = process.env;
  if (
    !account ||
    !/^[a-f0-9]{32}$/.test(account) ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket
  )
    throw new ProviderNotConfigured("Cloudflare R2");
  return new R2EditorialStorage(
    new S3Client({
      region: "auto",
      endpoint: `https://${account}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      maxAttempts: 3,
      requestHandler: { requestTimeout: 5000, connectionTimeout: 3000 },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
    bucket,
  );
}
