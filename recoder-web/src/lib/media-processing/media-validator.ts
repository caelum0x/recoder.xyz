export interface ValidationResult {
  valid: boolean
  error?: string
  metadata?: Record<string, any>
}

export class MediaValidator {
  private maxFileSize: number
  private allowedVideoFormats: Set<string>
  private allowedAudioFormats: Set<string>
  private allowedImageFormats: Set<string>

  constructor() {
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '500000000') // 500MB
    
    this.allowedVideoFormats = new Set([
      'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v', '3gp', 'mts', 'ts'
    ])
    
    this.allowedAudioFormats = new Set([
      'mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'aiff', 'amr', 'ac3'
    ])
    
    this.allowedImageFormats = new Set([
      'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'svg', 'ico'
    ])
  }

  async validateFile(file: File): Promise<ValidationResult> {
    try {
      // Check file size
      if (file.size > this.maxFileSize) {
        return {
          valid: false,
          error: `File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds maximum allowed size of ${this.maxFileSize / 1024 / 1024}MB`
        }
      }

      // Check if file is empty
      if (file.size === 0) {
        return {
          valid: false,
          error: 'File is empty'
        }
      }

      // Get file extension
      const extension = this.getFileExtension(file.name)
      if (!extension) {
        return {
          valid: false,
          error: 'File must have a valid extension'
        }
      }

      // Check if format is supported
      const isVideoFile = this.allowedVideoFormats.has(extension)
      const isAudioFile = this.allowedAudioFormats.has(extension)
      const isImageFile = this.allowedImageFormats.has(extension)

      if (!isVideoFile && !isAudioFile && !isImageFile) {
        return {
          valid: false,
          error: `File format .${extension} is not supported. Supported formats: ${this.getSupportedFormatsString()}`
        }
      }

      // Validate MIME type
      const mimeValidation = this.validateMimeType(file.type, extension)
      if (!mimeValidation.valid) {
        return mimeValidation
      }

      // Additional validation based on file type
      let metadata: Record<string, any> = {
        fileType: isVideoFile ? 'video' : isAudioFile ? 'audio' : 'image',
        extension,
        originalSize: file.size,
        lastModified: file.lastModified
      }

      // For video files, add video-specific validation
      if (isVideoFile) {
        const videoValidation = await this.validateVideoFile(file)
        if (!videoValidation.valid) {
          return videoValidation
        }
        metadata = { ...metadata, ...videoValidation.metadata }
      }

      // For audio files, add audio-specific validation
      if (isAudioFile) {
        const audioValidation = await this.validateAudioFile(file)
        if (!audioValidation.valid) {
          return audioValidation
        }
        metadata = { ...metadata, ...audioValidation.metadata }
      }

      // For image files, add image-specific validation
      if (isImageFile) {
        const imageValidation = await this.validateImageFile(file)
        if (!imageValidation.valid) {
          return imageValidation
        }
        metadata = { ...metadata, ...imageValidation.metadata }
      }

      return {
        valid: true,
        metadata
      }

    } catch (error) {
      return {
        valid: false,
        error: 'Failed to validate file'
      }
    }
  }

  private getFileExtension(filename: string): string {
    const parts = filename.split('.')
    return parts.length > 1 ? parts.pop()!.toLowerCase() : ''
  }

  private validateMimeType(mimeType: string, extension: string): ValidationResult {
    // Basic MIME type validation
    const videoMimeTypes = [
      'video/mp4', 'video/avi', 'video/quicktime', 'video/x-ms-wmv',
      'video/x-flv', 'video/webm', 'video/x-matroska', 'video/3gpp'
    ]
    
    const audioMimeTypes = [
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/flac',
      'audio/aac', 'audio/ogg', 'audio/x-ms-wma', 'audio/x-aiff'
    ]
    
    const imageMimeTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp',
      'image/tiff', 'image/svg+xml', 'image/x-icon'
    ]

    const isVideoMime = videoMimeTypes.some(type => mimeType.startsWith(type.split('/')[0]))
    const isAudioMime = audioMimeTypes.some(type => mimeType.startsWith(type.split('/')[0]))
    const isImageMime = imageMimeTypes.some(type => mimeType.startsWith(type.split('/')[0]))

    const isVideoExt = this.allowedVideoFormats.has(extension)
    const isAudioExt = this.allowedAudioFormats.has(extension)
    const isImageExt = this.allowedImageFormats.has(extension)

    // Check for obvious mismatches
    if ((isVideoExt && !isVideoMime && !mimeType.includes('video')) ||
        (isAudioExt && !isAudioMime && !mimeType.includes('audio')) ||
        (isImageExt && !isImageMime && !mimeType.includes('image'))) {
      
      // Allow some flexibility for common misconfigurations
      if (mimeType === 'application/octet-stream' || mimeType === '') {
        return { valid: true } // Generic binary, let FFmpeg handle it
      }

      return {
        valid: false,
        error: `File type mismatch: extension .${extension} doesn't match MIME type ${mimeType}`
      }
    }

    return { valid: true }
  }

  private async validateVideoFile(file: File): Promise<ValidationResult> {
    try {
      // Basic video file validation
      const metadata: Record<string, any> = {
        estimatedDuration: 0,
        canExtractAudio: true
      }

      // Check for very small video files that might be corrupt
      if (file.size < 1024) { // Less than 1KB
        return {
          valid: false,
          error: 'Video file appears to be too small or corrupt'
        }
      }

      return {
        valid: true,
        metadata
      }
    } catch (error) {
      return {
        valid: false,
        error: 'Failed to validate video file'
      }
    }
  }

  private async validateAudioFile(file: File): Promise<ValidationResult> {
    try {
      const metadata: Record<string, any> = {
        estimatedDuration: 0,
        canEnhance: true
      }

      // Check for very small audio files that might be corrupt
      if (file.size < 1024) { // Less than 1KB
        return {
          valid: false,
          error: 'Audio file appears to be too small or corrupt'
        }
      }

      return {
        valid: true,
        metadata
      }
    } catch (error) {
      return {
        valid: false,
        error: 'Failed to validate audio file'
      }
    }
  }

  private async validateImageFile(file: File): Promise<ValidationResult> {
    try {
      // Create a temporary image to validate
      const img = new Image()
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      return new Promise((resolve) => {
        img.onload = () => {
          const metadata: Record<string, any> = {
            width: img.width,
            height: img.height,
            aspectRatio: img.width / img.height,
            canResize: true
          }

          // Check for reasonable dimensions
          if (img.width > 8192 || img.height > 8192) {
            resolve({
              valid: false,
              error: `Image dimensions ${img.width}x${img.height} exceed maximum allowed size of 8192x8192`
            })
            return
          }

          if (img.width < 1 || img.height < 1) {
            resolve({
              valid: false,
              error: 'Invalid image dimensions'
            })
            return
          }

          resolve({
            valid: true,
            metadata
          })
        }

        img.onerror = () => {
          resolve({
            valid: false,
            error: 'Failed to load image - file may be corrupt'
          })
        }

        // Create object URL for the image
        const url = URL.createObjectURL(file)
        img.src = url
        
        // Clean up URL after a timeout
        setTimeout(() => {
          URL.revokeObjectURL(url)
        }, 5000)
      })

    } catch (error) {
      return {
        valid: false,
        error: 'Failed to validate image file'
      }
    }
  }

  private getSupportedFormatsString(): string {
    const allFormats = [
      ...Array.from(this.allowedVideoFormats),
      ...Array.from(this.allowedAudioFormats),
      ...Array.from(this.allowedImageFormats)
    ]
    return allFormats.slice(0, 10).join(', ') + (allFormats.length > 10 ? '...' : '')
  }

  // Utility methods
  isVideoFile(filename: string): boolean {
    const ext = this.getFileExtension(filename)
    return this.allowedVideoFormats.has(ext)
  }

  isAudioFile(filename: string): boolean {
    const ext = this.getFileExtension(filename)
    return this.allowedAudioFormats.has(ext)
  }

  isImageFile(filename: string): boolean {
    const ext = this.getFileExtension(filename)
    return this.allowedImageFormats.has(ext)
  }

  getMaxFileSize(): number {
    return this.maxFileSize
  }

  getAllowedExtensions(): string[] {
    return [
      ...Array.from(this.allowedVideoFormats),
      ...Array.from(this.allowedAudioFormats),
      ...Array.from(this.allowedImageFormats)
    ]
  }
}

// Export function for easy use
export const validateMediaFile = async (file: File): Promise<ValidationResult> => {
  const validator = new MediaValidator();
  return validator.validateFile(file);
};
