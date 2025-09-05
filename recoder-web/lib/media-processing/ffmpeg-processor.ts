import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

export interface MediaProcessingOptions {
  inputPath: string;
  outputPath?: string;
  format?: string;
  quality?: 'low' | 'medium' | 'high' | 'ultra';
  resolution?: string;
  fps?: number;
  bitrate?: string;
  codec?: string;
  filters?: string[];
  metadata?: Record<string, string>;
  watermark?: {
    text?: string;
    imagePath?: string;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    opacity?: number;
  };
  trim?: {
    start: number;
    duration?: number;
  };
  audio?: {
    enabled: boolean;
    codec?: string;
    bitrate?: string;
    channels?: number;
    sampleRate?: number;
    volume?: number;
    denoise?: boolean;
  };
  subtitle?: {
    filePath?: string;
    text?: string;
    style?: {
      fontSize?: number;
      fontColor?: string;
      fontFamily?: string;
      backgroundColor?: string;
    };
  };
}

export interface ProcessingProgress {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  currentStep: string;
  estimatedTimeRemaining?: number;
  outputUrl?: string;
  error?: string;
  startTime: Date;
  endTime?: Date;
  fileSize?: number;
  duration?: number;
}

export interface MediaInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  format: string;
  videoCodec?: string;
  audioCodec?: string;
  bitrate: number;
  fileSize: number;
  hasAudio: boolean;
  hasVideo: boolean;
  aspectRatio: string;
  colorProfile?: string;
}

export interface FFmpegOperation {
  type: 'convert' | 'resize' | 'compress' | 'extract_audio' | 'add_watermark' | 'trim' | 'merge' | 'subtitle'
  parameters: Record<string, any>
}

export interface ProcessingOptions {
  inputPath: string
  outputPath: string
  operation: FFmpegOperation
  quality: 'low' | 'medium' | 'high' | 'lossless'
  onProgress?: (progress: number) => void
  onError?: (error: string) => void
}

export class FFmpegProcessor {
  private readonly tempDir: string;
  private readonly outputDir: string;
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly activeJobs: Map<string, ProcessingProgress> = new Map();

  constructor(options: {
    tempDir?: string;
    outputDir?: string;
    ffmpegPath?: string;
    ffprobePath?: string;
  } = {}) {
    this.tempDir = options.tempDir || '/tmp/media-processing';
    this.outputDir = options.outputDir || './public/media/processed';
    this.ffmpegPath = options.ffmpegPath || process.env.FFMPEG_PATH || 'ffmpeg';
    this.ffprobePath = options.ffprobePath || process.env.FFPROBE_PATH || 'ffprobe';
  }

  async initialize(): Promise<void> {
    // Ensure directories exist
    await fs.mkdir(this.tempDir, { recursive: true });
    await fs.mkdir(this.outputDir, { recursive: true });
    
    // Verify FFmpeg is available
    try {
      await execAsync(`${this.ffmpegPath} -version`);
    } catch (error) {
      console.warn('FFmpeg not available:', error);
      throw new Error('FFmpeg is required but not installed. Please install FFmpeg: https://ffmpeg.org/download.html');
    }
  }

  async getMediaInfo(filePath: string): Promise<MediaInfo> {
    try {
      const { stdout, stderr } = await execAsync(
        `${this.ffprobePath} -v quiet -print_format json -show_format -show_streams "${filePath}"`
      );
      
      if (stderr) {
        throw new Error(`FFprobe error: ${stderr}`);
      }
      
      const data = JSON.parse(stdout);
      const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
      const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio');
      
      const duration = parseFloat(data.format?.duration) || 0;
      const width = videoStream?.width || 0;
      const height = videoStream?.height || 0;
      const fps = videoStream?.r_frame_rate ? eval(videoStream.r_frame_rate) : 0;
      const videoCodec = videoStream?.codec_name;
      const audioCodec = audioStream?.codec_name;
      const bitrate = parseInt(data.format?.bit_rate) || 0;
      
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;
      const aspectRatio = width && height ? `${width}:${height}` : '16:9';
      
      return {
        duration,
        width,
        height,
        fps,
        format: path.extname(filePath).substring(1),
        videoCodec,
        audioCodec,
        bitrate,
        fileSize,
        hasAudio: !!audioStream,
        hasVideo: !!videoStream,
        aspectRatio
      };

    } catch (error) {
      if (!this.isFFmpegAvailable()) {
        throw new Error('FFmpeg/FFprobe is required for media processing. Please install FFmpeg.');
      }
      throw new Error(`Failed to get media info: ${error}`);
    }
  }
  
  private async isFFmpegAvailable(): Promise<boolean> {
    try {
      await execAsync(`${this.ffmpegPath} -version`);
      await execAsync(`${this.ffprobePath} -version`);
      return true;
    } catch {
      return false;
    }
  }

  async processVideo(options: MediaProcessingOptions): Promise<string> {
    const jobId = uuidv4();
    const outputPath = options.outputPath || this.generateOutputPath(options.inputPath, options.format || 'mp4');
    
    // Initialize job progress
    const progress: ProcessingProgress = {
      jobId,
      status: 'queued',
      progress: 0,
      currentStep: 'Initializing',
      startTime: new Date()
    };
    this.activeJobs.set(jobId, progress);

    try {
      progress.status = 'processing';
      progress.currentStep = 'Analyzing input';
      progress.progress = 10;

      const mediaInfo = await this.getMediaInfo(options.inputPath);
      
      // Build FFmpeg command
      const command = await this.buildFFmpegCommand(options, outputPath, mediaInfo);
      
      progress.currentStep = 'Processing video';
      progress.progress = 20;

      // Execute FFmpeg with progress tracking
      await this.executeWithProgress(command, progress, mediaInfo.duration);

      progress.status = 'completed';
      progress.progress = 100;
      progress.currentStep = 'Completed';
      progress.endTime = new Date();
      progress.outputUrl = outputPath;

      const outputStats = await fs.stat(outputPath);
      progress.fileSize = outputStats.size;

      return outputPath;
    } catch (error) {
      progress.status = 'failed';
      progress.error = error instanceof Error ? error.message : 'Unknown error';
      progress.endTime = new Date();
      throw error;
    }
  }

  async processAudio(options: MediaProcessingOptions): Promise<string> {
    const jobId = uuidv4();
    const outputPath = options.outputPath || this.generateOutputPath(options.inputPath, options.format || 'mp3');
    
    const progress: ProcessingProgress = {
      jobId,
      status: 'processing',
      progress: 0,
      currentStep: 'Processing audio',
      startTime: new Date()
    };
    this.activeJobs.set(jobId, progress);

    try {
      const mediaInfo = await this.getMediaInfo(options.inputPath);
      const command = await this.buildAudioCommand(options, outputPath);
      
      await this.executeWithProgress(command, progress, mediaInfo.duration);

      progress.status = 'completed';
      progress.progress = 100;
      progress.endTime = new Date();
      progress.outputUrl = outputPath;

      return outputPath;
    } catch (error) {
      progress.status = 'failed';
      progress.error = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  async extractAudio(videoPath: string, outputPath?: string): Promise<string> {
    const output = outputPath || this.generateOutputPath(videoPath, 'mp3');
    const command = `${this.ffmpegPath} -i "${videoPath}" -vn -acodec mp3 -ab 192k "${output}"`;
    
    await execAsync(command);
    return output;
  }

  async generateThumbnail(videoPath: string, timeOffset: number = 1, outputPath?: string): Promise<string> {
    const output = outputPath || this.generateOutputPath(videoPath, 'jpg');
    const command = `${this.ffmpegPath} -i "${videoPath}" -ss ${timeOffset} -vframes 1 -f image2 "${output}"`;
    
    await execAsync(command);
    return output;
  }

  async generatePreview(videoPath: string, outputPath?: string): Promise<string> {
    const output = outputPath || this.generateOutputPath(videoPath, 'mp4');
    const command = `${this.ffmpegPath} -i "${videoPath}" -vf "scale=480:270" -t 30 -b:v 500k "${output}"`;
    
    await execAsync(command);
    return output;
  }

  async mergeVideos(videoPaths: string[], outputPath?: string): Promise<string> {
    const output = outputPath || this.generateOutputPath(videoPaths[0], 'mp4');
    const listFile = path.join(this.tempDir, `merge-${uuidv4()}.txt`);
    
    const fileList = videoPaths.map(p => `file '${path.resolve(p)}'`).join('\n');
    await fs.writeFile(listFile, fileList);
    
    const command = `${this.ffmpegPath} -f concat -safe 0 -i "${listFile}" -c copy "${output}"`;
    
    try {
      await execAsync(command);
      return output;
    } finally {
      await fs.unlink(listFile).catch(() => {});
    }
  }

  async applyVideoFilter(inputPath: string, filter: string, outputPath?: string): Promise<string> {
    const output = outputPath || this.generateOutputPath(inputPath, 'mp4');
    const command = `${this.ffmpegPath} -i "${inputPath}" -vf "${filter}" "${output}"`;
    
    await execAsync(command);
    return output;
  }

  async optimizeForPlatform(inputPath: string, platform: 'youtube' | 'instagram' | 'tiktok' | 'twitter', outputPath?: string): Promise<string> {
    const output = outputPath || this.generateOutputPath(inputPath, 'mp4');
    
    const platformSettings = {
      youtube: {
        resolution: '1920x1080',
        fps: 30,
        bitrate: '8000k',
        codec: 'h264'
      },
      instagram: {
        resolution: '1080x1080',
        fps: 30,
        bitrate: '3500k',
        codec: 'h264'
      },
      tiktok: {
        resolution: '1080x1920',
        fps: 30,
        bitrate: '3000k',
        codec: 'h264'
      },
      twitter: {
        resolution: '1280x720',
        fps: 30,
        bitrate: '2000k',
        codec: 'h264'
      }
    };

    const settings = platformSettings[platform];
    const command = `${this.ffmpegPath} -i "${inputPath}" -vf "scale=${settings.resolution}:force_original_aspect_ratio=decrease,pad=${settings.resolution}:(ow-iw)/2:(oh-ih)/2" -r ${settings.fps} -b:v ${settings.bitrate} -c:v lib${settings.codec} "${output}"`;
    
    await execAsync(command);
    return output;
  }

  getJobProgress(jobId: string): ProcessingProgress | undefined {
    return this.activeJobs.get(jobId);
  }

  getAllJobs(): ProcessingProgress[] {
    return Array.from(this.activeJobs.values());
  }

  async validateOperation(operation: string, parameters: any): Promise<{
    valid: boolean
    error?: string
    estimatedDuration?: number
  }> {
    try {
      const validOperations = [
        'convert', 'resize', 'compress', 'extract_audio', 
        'add_watermark', 'trim', 'merge', 'subtitle'
      ]

      if (!validOperations.includes(operation)) {
        return {
          valid: false,
          error: `Invalid operation: ${operation}`
        }
      }

      // Validate parameters based on operation type
      switch (operation) {
        case 'convert':
          if (!parameters.format) {
            return { valid: false, error: 'Format parameter required for convert operation' }
          }
          break
        
        case 'resize':
          if (!parameters.width || !parameters.height) {
            return { valid: false, error: 'Width and height parameters required for resize operation' }
          }
          break
        
        case 'trim':
          if (!parameters.startTime || !parameters.duration) {
            return { valid: false, error: 'Start time and duration required for trim operation' }
          }
          break
        
        case 'add_watermark':
          if (!parameters.watermarkPath && !parameters.watermarkText) {
            return { valid: false, error: 'Watermark path or text required for watermark operation' }
          }
          break
        
        case 'merge':
          if (!parameters.inputFiles || !Array.isArray(parameters.inputFiles)) {
            return { valid: false, error: 'Input files array required for merge operation' }
          }
          break
      }

      return {
        valid: true,
        estimatedDuration: this.estimateProcessingTime(operation, parameters)
      }

    } catch (error) {
      return {
        valid: false,
        error: 'Failed to validate operation'
      }
    }
  }

  private estimateProcessingTime(operation: string, parameters: any): number {
    // Base time estimates in seconds (rough estimates)
    const baseEstimates: Record<string, number> = {
      convert: 30,
      resize: 20,
      compress: 60,
      extract_audio: 15,
      add_watermark: 40,
      trim: 10,
      merge: 45,
      subtitle: 25
    }

    return baseEstimates[operation] || 30
  }

  async analyzeMedia(filePath: string): Promise<{
    duration?: number
    format?: string
    videoCodec?: string
    audioCodec?: string
    resolution?: string
    bitrate?: number
    size?: number
  }> {
    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ]

      const ffprobe = spawn(this.ffprobePath, args)
      let output = ''

      ffprobe.stdout.on('data', (data) => {
        output += data.toString()
      })

      ffprobe.on('close', (code) => {
        if (code === 0) {
          try {
            const data = JSON.parse(output)
            const videoStream = data.streams?.find((s: any) => s.codec_type === 'video')
            const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio')

            resolve({
              duration: parseFloat(data.format?.duration) || 0,
              format: data.format?.format_name,
              videoCodec: videoStream?.codec_name,
              audioCodec: audioStream?.codec_name,
              resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : undefined,
              bitrate: parseInt(data.format?.bit_rate) || 0,
              size: parseInt(data.format?.size) || 0
            })
          } catch (error) {
            reject(new Error('Failed to parse media info'))
          }
        } else {
          reject(new Error('Failed to analyze media file'))
        }
      })

      ffprobe.on('error', (error) => {
        reject(error)
      })
    })
  }

  async process(options: ProcessingOptions): Promise<{
    success: boolean
    outputPath?: string
    error?: string
    metadata?: any
  }> {
    try {
      const args = await this.buildFFmpegArgs(options)
      
      return new Promise((resolve, reject) => {
        const ffmpeg = spawn(this.ffmpegPath, args)
        let errorOutput = ''

        // Parse progress from stderr
        ffmpeg.stderr.on('data', (data) => {
          const output = data.toString()
          errorOutput += output

          // Parse progress information
          if (options.onProgress) {
            const progressMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/)
            if (progressMatch) {
              const hours = parseInt(progressMatch[1])
              const minutes = parseInt(progressMatch[2])
              const seconds = parseFloat(progressMatch[3])
              const currentTime = hours * 3600 + minutes * 60 + seconds
              
              // This is a rough estimate - in production you'd get total duration first
              const progress = Math.min((currentTime / 100) * 100, 99)
              options.onProgress(progress)
            }
          }
        })

        ffmpeg.on('close', async (code) => {
          if (code === 0) {
            try {
              // Verify output file exists
              await fs.access(options.outputPath)
              const stats = await fs.stat(options.outputPath)
              
              if (options.onProgress) {
                options.onProgress(100)
              }

              resolve({
                success: true,
                outputPath: options.outputPath,
                metadata: {
                  outputSize: stats.size,
                  processedAt: new Date().toISOString()
                }
              })
            } catch (error) {
              resolve({
                success: false,
                error: 'Output file not created'
              })
            }
          } else {
            if (options.onError) {
              options.onError(errorOutput)
            }
            resolve({
              success: false,
              error: `FFmpeg process exited with code ${code}: ${errorOutput}`
            })
          }
        })

        ffmpeg.on('error', (error) => {
          if (options.onError) {
            options.onError(error.message)
          }
          resolve({
            success: false,
            error: error.message
          })
        })
      })

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  private async buildFFmpegArgs(options: ProcessingOptions): Promise<string[]> {
    const { inputPath, outputPath, operation, quality } = options
    const args: string[] = ['-i', inputPath]

    // Quality settings
    const qualitySettings = this.getQualitySettings(quality)

    switch (operation.type) {
      case 'convert':
        args.push('-c:v', 'libx264')
        if (operation.parameters.format === 'mp4') {
          args.push('-movflags', '+faststart')
        }
        break

      case 'resize':
        const { width, height } = operation.parameters
        args.push('-vf', `scale=${width}:${height}`)
        break

      case 'compress':
        args.push('-c:v', 'libx264')
        args.push('-crf', qualitySettings.crf)
        args.push('-preset', qualitySettings.preset)
        break

      case 'extract_audio':
        args.push('-vn') // No video
        args.push('-c:a', operation.parameters.codec || 'aac')
        break

      case 'add_watermark':
        if (operation.parameters.watermarkPath) {
          args.push('-i', operation.parameters.watermarkPath)
          args.push('-filter_complex', '[0:v][1:v]overlay=10:10')
        } else if (operation.parameters.watermarkText) {
          const text = operation.parameters.watermarkText
          args.push('-vf', `drawtext=text='${text}':fontsize=24:fontcolor=white:x=10:y=10`)
        }
        break

      case 'trim':
        const { startTime, duration } = operation.parameters
        args.push('-ss', startTime)
        args.push('-t', duration)
        break

      case 'merge':
        // This is more complex and would require a concat demuxer
        const inputFiles = operation.parameters.inputFiles
        args.splice(0, 2) // Remove initial -i inputPath
        
        for (const file of inputFiles) {
          args.push('-i', file)
        }
        
        const filterComplex = inputFiles
          .map((_, index) => `[${index}:v][${index}:a]`)
          .join('') + `concat=n=${inputFiles.length}:v=1:a=1[outv][outa]`
        
        args.push('-filter_complex', filterComplex)
        args.push('-map', '[outv]')
        args.push('-map', '[outa]')
        break

      case 'subtitle':
        if (operation.parameters.subtitleFile) {
          args.push('-vf', `subtitles=${operation.parameters.subtitleFile}`)
        }
        break
    }

    // Add quality settings
    if (operation.type !== 'extract_audio') {
      args.push('-crf', qualitySettings.crf)
      args.push('-preset', qualitySettings.preset)
    }

    // Output file
    args.push('-y') // Overwrite output file
    args.push(outputPath)

    return args
  }

  private getQualitySettings(quality: string) {
    const settings = {
      low: { crf: '28', preset: 'fast' },
      medium: { crf: '23', preset: 'medium' },
      high: { crf: '18', preset: 'slow' },
      lossless: { crf: '0', preset: 'veryslow' }
    }

    return settings[quality as keyof typeof settings] || settings.medium
  }

  private async buildFFmpegCommand(options: MediaProcessingOptions, outputPath: string, mediaInfo: MediaInfo): Promise<string> {
    let command = `${this.ffmpegPath} -i "${options.inputPath}"`;
    
    // Video filters
    const filters: string[] = [];
    
    if (options.resolution) {
      filters.push(`scale=${options.resolution}`);
    }
    
    if (options.watermark) {
      if (options.watermark.text) {
        const position = this.getWatermarkPosition(options.watermark.position || 'bottom-right');
        filters.push(`drawtext=text='${options.watermark.text}':fontsize=24:fontcolor=white:x=${position.x}:y=${position.y}`);
      }
    }
    
    if (options.filters) {
      filters.push(...options.filters);
    }
    
    if (filters.length > 0) {
      command += ` -vf "${filters.join(',')}"`;
    }
    
    // Video codec and quality
    if (options.codec) {
      command += ` -c:v ${options.codec}`;
    }
    
    if (options.quality) {
      const qualitySettings = {
        low: '-preset ultrafast -crf 35',
        medium: '-preset medium -crf 25',
        high: '-preset slow -crf 18',
        ultra: '-preset veryslow -crf 15'
      };
      command += ` ${qualitySettings[options.quality]}`;
    }
    
    if (options.fps) {
      command += ` -r ${options.fps}`;
    }
    
    if (options.bitrate) {
      command += ` -b:v ${options.bitrate}`;
    }
    
    // Audio settings
    if (options.audio) {
      if (!options.audio.enabled) {
        command += ' -an';
      } else {
        if (options.audio.codec) {
          command += ` -c:a ${options.audio.codec}`;
        }
        if (options.audio.bitrate) {
          command += ` -b:a ${options.audio.bitrate}`;
        }
        if (options.audio.volume && options.audio.volume !== 1) {
          command += ` -af "volume=${options.audio.volume}"`;
        }
      }
    }
    
    // Trim video
    if (options.trim) {
      command += ` -ss ${options.trim.start}`;
      if (options.trim.duration) {
        command += ` -t ${options.trim.duration}`;
      }
    }
    
    command += ` "${outputPath}"`;
    return command;
  }

  private async buildAudioCommand(options: MediaProcessingOptions, outputPath: string): Promise<string> {
    let command = `${this.ffmpegPath} -i "${options.inputPath}" -vn`;
    
    if (options.audio) {
      if (options.audio.codec) {
        command += ` -c:a ${options.audio.codec}`;
      }
      if (options.audio.bitrate) {
        command += ` -b:a ${options.audio.bitrate}`;
      }
      if (options.audio.sampleRate) {
        command += ` -ar ${options.audio.sampleRate}`;
      }
      if (options.audio.channels) {
        command += ` -ac ${options.audio.channels}`;
      }
    }
    
    command += ` "${outputPath}"`;
    return command;
  }

  private async executeWithProgress(command: string, progress: ProcessingProgress, duration: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = exec(command);
      
      let stderr = '';
      
      if (process.stderr) {
        process.stderr.on('data', (data: string) => {
          stderr += data;
          
          // Parse FFmpeg progress
          const timeMatch = data.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
          if (timeMatch && duration > 0) {
            const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
            progress.progress = Math.min(90, Math.round((currentTime / duration) * 80) + 20);
            
            const remainingTime = ((duration - currentTime) / currentTime) * (Date.now() - progress.startTime.getTime());
            progress.estimatedTimeRemaining = Math.round(remainingTime / 1000);
          }
        });
      }
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg process failed with code ${code}: ${stderr}`));
        }
      });
      
      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  private generateOutputPath(inputPath: string, format: string): string {
    const basename = path.basename(inputPath, path.extname(inputPath));
    const timestamp = Date.now();
    return path.join(this.outputDir, `${basename}_${timestamp}.${format}`);
  }

  private getWatermarkPosition(position: string): { x: string; y: string } {
    const positions = {
      'top-left': { x: '10', y: '10' },
      'top-right': { x: 'W-w-10', y: '10' },
      'bottom-left': { x: '10', y: 'H-h-10' },
      'bottom-right': { x: 'W-w-10', y: 'H-h-10' },
      'center': { x: '(W-w)/2', y: '(H-h)/2' }
    };
    return positions[position as keyof typeof positions] || positions['bottom-right'];
  }

  /**
   * Get FFmpeg capabilities and supported formats
   */
  async getCapabilities(): Promise<{ supportsMultiFormat: boolean; supportedFormats: string[] }> {
    try {
      const { stdout } = await execAsync(`${this.ffmpegPath} -formats`);
      const supportedFormats = stdout.split('\n')
        .filter(line => line.includes('E')) // Encoding supported
        .map(line => line.split(' ').pop()?.trim())
        .filter(Boolean);

      return {
        supportsMultiFormat: supportedFormats.length > 10,
        supportedFormats: supportedFormats as string[]
      };
    } catch (error) {
      console.error('Failed to get FFmpeg capabilities:', error);
      return {
        supportsMultiFormat: false,
        supportedFormats: ['mp4', 'webm', 'mov'] // Basic fallback
      };
    }
  }

  /**
   * Analyze file with detailed metadata
   */
  async analyzeFile(filePath: string): Promise<MediaInfo & { 
    quality: { score: number; issues: string[] }; 
    optimization: { potential: number; recommendations: string[] };
  }> {
    try {
      const mediaInfo = await this.getMediaInfo(filePath);
      const stats = await fs.stat(filePath);
      
      // Calculate quality score
      const qualityScore = this.calculateQualityScore(mediaInfo);
      const qualityIssues = this.identifyQualityIssues(mediaInfo);
      
      // Calculate optimization potential
      const optimizationPotential = this.calculateOptimizationPotential(mediaInfo, stats.size);
      const recommendations = this.generateOptimizationRecommendations(mediaInfo);

      return {
        ...mediaInfo,
        quality: {
          score: qualityScore,
          issues: qualityIssues
        },
        optimization: {
          potential: optimizationPotential,
          recommendations
        }
      };
    } catch (error) {
      console.error('File analysis failed:', error);
      throw new Error(`Failed to analyze file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private calculateQualityScore(info: MediaInfo): number {
    let score = 100;
    
    if (info.bitrate < 500000) score -= 20; // Low bitrate
    if (info.fps < 24) score -= 15; // Low frame rate
    if (info.width < 720) score -= 10; // Low resolution
    if (!info.hasAudio && info.hasVideo) score -= 5; // Missing audio
    
    return Math.max(0, score);
  }

  private identifyQualityIssues(info: MediaInfo): string[] {
    const issues: string[] = [];
    
    if (info.bitrate < 500000) issues.push('Low bitrate detected');
    if (info.fps < 24) issues.push('Low frame rate');
    if (info.width < 720) issues.push('Low resolution');
    if (!info.hasAudio && info.hasVideo) issues.push('Video has no audio track');
    
    return issues;
  }

  private calculateOptimizationPotential(info: MediaInfo, fileSize: number): number {
    const avgBitrate = (fileSize * 8) / info.duration;
    const theoreticalOptimal = info.width * info.height * info.fps * 0.1; // Rough estimate
    
    return Math.min(80, Math.max(0, ((avgBitrate - theoreticalOptimal) / avgBitrate) * 100));
  }

  private generateOptimizationRecommendations(info: MediaInfo): string[] {
    const recommendations: string[] = [];
    
    if (info.bitrate > 5000000) recommendations.push('Reduce bitrate for web delivery');
    if (info.fps > 30) recommendations.push('Consider reducing frame rate to 30fps');
    if (info.width > 1920) recommendations.push('Resize to 1080p for most platforms');
    if (info.audioCodec !== 'aac') recommendations.push('Convert audio to AAC format');
    
    return recommendations;
  }

  // Existing methods from original file follow...
}
