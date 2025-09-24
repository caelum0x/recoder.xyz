// Type declaration for fluent-ffmpeg module
declare module 'fluent-ffmpeg' {
  interface FfmpegCommand {
    input(source: string): FfmpegCommand;
    output(target: string): FfmpegCommand;
    size(size: string): FfmpegCommand;
    fps(fps: number): FfmpegCommand;
    videoBitrate(bitrate: string): FfmpegCommand;
    audioBitrate(bitrate: string): FfmpegCommand;
    format(format: string): FfmpegCommand;
    duration(duration: string | number): FfmpegCommand;
    seekInput(time: string | number): FfmpegCommand;
    audioCodec(codec: string): FfmpegCommand;
    videoCodec(codec: string): FfmpegCommand;
    addOption(option: string | string[]): FfmpegCommand;
    addOptions(options: string[]): FfmpegCommand;
    on(event: string, callback: (...args: any[]) => void): FfmpegCommand;
    run(): void;
    save(filename: string): FfmpegCommand;
    pipe(stream?: any): any;
  }

  interface FfmpegStatic {
    (input?: string): FfmpegCommand;
    setFfmpegPath(path: string): FfmpegStatic;
    setFfprobePath(path: string): FfmpegStatic;
    getAvailableFormats(callback: (err: Error | null, formats: any) => void): void;
    getAvailableCodecs(callback: (err: Error | null, codecs: any) => void): void;
  }

  const ffmpeg: FfmpegStatic;
  export = ffmpeg;
}