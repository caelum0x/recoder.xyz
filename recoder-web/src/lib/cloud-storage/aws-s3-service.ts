import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront'
import { v4 as uuidv4 } from 'uuid'

export interface UploadOptions {
  bucket: string
  key: string
  body: Buffer | Uint8Array | string
  contentType?: string
  metadata?: Record<string, string>
  cacheControl?: string
  acl?: 'private' | 'public-read' | 'public-read-write'
}

export interface PresignedUrlOptions {
  bucket: string
  key: string
  expires?: number
  contentType?: string
  metadata?: Record<string, string>
}

export interface CloudStorageFile {
  id: string
  key: string
  bucket: string
  url: string
  cdnUrl?: string
  size: number
  contentType: string
  etag: string
  lastModified: Date
  metadata?: Record<string, string>
}

export class AWSS3Service {
  private s3Client: S3Client
  private cloudFrontClient: CloudFrontClient | null = null
  private readonly region: string
  private readonly bucketName: string
  private readonly cdnDomain?: string
  private readonly distributionId?: string

  constructor(options: {
    region: string
    accessKeyId: string
    secretAccessKey: string
    bucketName: string
    cdnDomain?: string
    distributionId?: string
  }) {
    const { region, accessKeyId, secretAccessKey, bucketName, cdnDomain, distributionId } = options

    this.region = region
    this.bucketName = bucketName
    this.cdnDomain = cdnDomain
    this.distributionId = distributionId

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    })

    if (distributionId) {
      this.cloudFrontClient = new CloudFrontClient({
        region: 'us-east-1', // CloudFront is always in us-east-1
        credentials: {
          accessKeyId,
          secretAccessKey
        }
      })
    }
  }

  /**
   * Upload file to S3
   */
  async uploadFile(options: UploadOptions): Promise<CloudStorageFile> {
    const { bucket, key, body, contentType, metadata, cacheControl = 'max-age=31536000', acl = 'private' } = options

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
      CacheControl: cacheControl,
      ACL: acl
    })

    const result = await this.s3Client.send(command)

    // Get file info
    const headCommand = new HeadObjectCommand({
      Bucket: bucket,
      Key: key
    })
    const headResult = await this.s3Client.send(headCommand)

    const s3Url = `https://${bucket}.s3.${this.region}.amazonaws.com/${key}`
    const cdnUrl = this.cdnDomain ? `https://${this.cdnDomain}/${key}` : undefined

    return {
      id: uuidv4(),
      key,
      bucket,
      url: s3Url,
      cdnUrl,
      size: headResult.ContentLength || 0,
      contentType: headResult.ContentType || 'application/octet-stream',
      etag: result.ETag?.replace(/"/g, '') || '',
      lastModified: headResult.LastModified || new Date(),
      metadata: headResult.Metadata
    }
  }

  /**
   * Upload media file with optimized settings
   */
  async uploadMediaFile(
    file: Buffer | Uint8Array,
    fileName: string,
    contentType: string,
    userId: string,
    purpose: 'original' | 'processed' | 'thumbnail' | 'preview' = 'original'
  ): Promise<CloudStorageFile> {
    const timestamp = Date.now()
    const ext = fileName.split('.').pop()
    const baseKey = `media/${userId}/${purpose}/${timestamp}-${uuidv4()}.${ext}`

    const metadata = {
      userId,
      purpose,
      originalName: fileName,
      uploadedAt: new Date().toISOString()
    }

    const cacheControl = purpose === 'thumbnail' || purpose === 'preview'
      ? 'max-age=604800, public' // 7 days for thumbnails
      : 'max-age=31536000, private' // 1 year for originals

    return this.uploadFile({
      bucket: this.bucketName,
      key: baseKey,
      body: file,
      contentType,
      metadata,
      cacheControl,
      acl: purpose === 'thumbnail' || purpose === 'preview' ? 'public-read' : 'private'
    })
  }

  /**
   * Generate presigned URL for upload
   */
  async getPresignedUploadUrl(options: PresignedUrlOptions): Promise<string> {
    const { bucket, key, expires = 3600, contentType, metadata } = options

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      Metadata: metadata
    })

    return getSignedUrl(this.s3Client, command, { expiresIn: expires })
  }

  /**
   * Generate presigned URL for download
   */
  async getPresignedDownloadUrl(bucket: string, key: string, expires: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    })

    return getSignedUrl(this.s3Client, command, { expiresIn: expires })
  }

  /**
   * Get file information
   */
  async getFileInfo(bucket: string, key: string): Promise<CloudStorageFile | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key
      })

      const result = await this.s3Client.send(command)

      const s3Url = `https://${bucket}.s3.${this.region}.amazonaws.com/${key}`
      const cdnUrl = this.cdnDomain ? `https://${this.cdnDomain}/${key}` : undefined

      return {
        id: uuidv4(),
        key,
        bucket,
        url: s3Url,
        cdnUrl,
        size: result.ContentLength || 0,
        contentType: result.ContentType || 'application/octet-stream',
        etag: result.ETag?.replace(/"/g, '') || '',
        lastModified: result.LastModified || new Date(),
        metadata: result.Metadata
      }
    } catch (error) {
      console.error('Failed to get file info:', error)
      return null
    }
  }

  /**
   * Copy file to new location
   */
  async copyFile(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string,
    metadata?: Record<string, string>
  ): Promise<CloudStorageFile> {
    const command = new CopyObjectCommand({
      CopySource: `${sourceBucket}/${sourceKey}`,
      Bucket: destBucket,
      Key: destKey,
      Metadata: metadata,
      MetadataDirective: metadata ? 'REPLACE' : 'COPY'
    })

    await this.s3Client.send(command)

    const fileInfo = await this.getFileInfo(destBucket, destKey)
    if (!fileInfo) {
      throw new Error('Failed to copy file')
    }

    return fileInfo
  }

  /**
   * Delete file
   */
  async deleteFile(bucket: string, key: string): Promise<boolean> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key
      })

      await this.s3Client.send(command)

      // Invalidate CloudFront cache if configured
      if (this.cloudFrontClient && this.distributionId) {
        await this.invalidateCloudFrontCache([key])
      }

      return true
    } catch (error) {
      console.error('Failed to delete file:', error)
      return false
    }
  }

  /**
   * Move file to new location
   */
  async moveFile(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string,
    metadata?: Record<string, string>
  ): Promise<CloudStorageFile> {
    // Copy to new location
    const newFile = await this.copyFile(sourceBucket, sourceKey, destBucket, destKey, metadata)

    // Delete original
    await this.deleteFile(sourceBucket, sourceKey)

    return newFile
  }

  /**
   * Invalidate CloudFront cache
   */
  async invalidateCloudFrontCache(paths: string[]): Promise<boolean> {
    if (!this.cloudFrontClient || !this.distributionId) {
      console.warn('CloudFront not configured, skipping cache invalidation')
      return false
    }

    try {
      const command = new CreateInvalidationCommand({
        DistributionId: this.distributionId,
        InvalidationBatch: {
          Paths: {
            Quantity: paths.length,
            Items: paths.map(path => `/${path}`)
          },
          CallerReference: `invalidation-${Date.now()}-${uuidv4()}`
        }
      })

      await this.cloudFrontClient.send(command)
      return true
    } catch (error) {
      console.error('Failed to invalidate CloudFront cache:', error)
      return false
    }
  }

  /**
   * Generate optimized URL for media delivery
   */
  getOptimizedUrl(key: string, transformations?: {
    width?: number
    height?: number
    quality?: number
    format?: 'webp' | 'avif' | 'jpg' | 'png'
    fit?: 'cover' | 'contain' | 'fill'
  }): string {
    const baseUrl = this.cdnDomain 
      ? `https://${this.cdnDomain}/${key}`
      : `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`

    if (!transformations) {
      return baseUrl
    }

    // If using CloudFront with Lambda@Edge or CloudFront Functions for image optimization
    const params = new URLSearchParams()
    
    if (transformations.width) params.set('w', transformations.width.toString())
    if (transformations.height) params.set('h', transformations.height.toString())
    if (transformations.quality) params.set('q', transformations.quality.toString())
    if (transformations.format) params.set('f', transformations.format)
    if (transformations.fit) params.set('fit', transformations.fit)

    return params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl
  }

  /**
   * Batch upload multiple files
   */
  async batchUpload(files: Array<{
    key: string
    body: Buffer | Uint8Array
    contentType: string
    metadata?: Record<string, string>
  }>): Promise<CloudStorageFile[]> {
    const uploadPromises = files.map(file => 
      this.uploadFile({
        bucket: this.bucketName,
        ...file
      })
    )

    return Promise.all(uploadPromises)
  }

  /**
   * Create multipart upload for large files
   */
  async createMultipartUpload(key: string, contentType: string): Promise<string> {
    // Implementation for large file uploads
    // This would use CreateMultipartUploadCommand, UploadPartCommand, and CompleteMultipartUploadCommand
    throw new Error('Multipart upload not implemented yet')
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(userId: string): Promise<{
    totalFiles: number
    totalSize: number
    byPurpose: Record<string, { count: number, size: number }>
  }> {
    // This would require implementing a metadata tracking system
    // For now, return placeholder data
    return {
      totalFiles: 0,
      totalSize: 0,
      byPurpose: {}
    }
  }
}

// Singleton instance
let s3Service: AWSS3Service | null = null

export function initializeS3Service(): AWSS3Service {
  if (!s3Service) {
    s3Service = new AWSS3Service({
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      bucketName: process.env.AWS_S3_BUCKET!,
      cdnDomain: process.env.CLOUDFRONT_DOMAIN,
      distributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID
    })
  }
  return s3Service
}

export function getS3Service(): AWSS3Service {
  if (!s3Service) {
    throw new Error('S3 service not initialized. Call initializeS3Service() first.')
  }
  return s3Service
}