/**
 * Backup & Disaster Recovery Service
 *
 * Automated backup system for:
 * - Project files and metadata
 * - User data and settings
 * - API keys and usage data
 * - Container snapshots
 *
 * Features:
 * - Scheduled backups (hourly, daily, weekly)
 * - Incremental backups
 * - Point-in-time recovery
 * - Off-site storage support (S3, GCS)
 */
export interface BackupJob {
    id: string;
    type: BackupType;
    status: BackupStatus;
    scope: BackupScope;
    startedAt: number;
    completedAt?: number;
    size?: number;
    checksum?: string;
    path?: string;
    error?: string;
    metadata?: Record<string, unknown>;
}
export type BackupType = 'full' | 'incremental' | 'snapshot';
export type BackupStatus = 'pending' | 'running' | 'completed' | 'failed';
export type BackupScope = 'all' | 'projects' | 'users' | 'api-keys' | 'containers';
export interface BackupConfig {
    /** Backup storage directory */
    backupDir: string;
    /** Maximum backups to retain */
    maxBackups: number;
    /** Enable hourly incremental backups */
    hourlyEnabled: boolean;
    /** Enable daily full backups */
    dailyEnabled: boolean;
    /** Enable weekly archival backups */
    weeklyEnabled: boolean;
    /** Compress backups */
    compress: boolean;
    /** Encrypt backups */
    encrypt: boolean;
    /** Encryption key (if encrypt=true) */
    encryptionKey?: string;
    /** Remote storage config */
    remoteStorage?: {
        type: 's3' | 'gcs' | 'azure';
        bucket: string;
        prefix?: string;
        credentials?: Record<string, string>;
    };
}
export interface RestoreOptions {
    backupId: string;
    scope?: BackupScope;
    targetDir?: string;
    dryRun?: boolean;
}
export interface RestoreResult {
    success: boolean;
    restoredFiles: number;
    restoredSize: number;
    errors: string[];
}
export interface BackupStats {
    totalBackups: number;
    totalSize: number;
    lastBackup?: BackupJob;
    nextScheduled?: {
        type: BackupType;
        scheduledAt: number;
    };
    retentionPolicy: {
        hourly: number;
        daily: number;
        weekly: number;
    };
}
declare class BackupService {
    private config;
    private jobs;
    private lastHourly?;
    private lastDaily?;
    private lastWeekly?;
    private schedulerInterval?;
    private isRunning;
    constructor(config?: Partial<BackupConfig>);
    /**
     * Start the backup scheduler
     */
    startScheduler(): void;
    /**
     * Stop the backup scheduler
     */
    stopScheduler(): void;
    /**
     * Create a backup immediately
     */
    createBackup(type?: BackupType, scope?: BackupScope): Promise<BackupJob>;
    /**
     * Restore from a backup
     */
    restore(options: RestoreOptions): Promise<RestoreResult>;
    /**
     * Delete a backup
     */
    deleteBackup(backupId: string): boolean;
    /**
     * Get backup statistics
     */
    getStats(): BackupStats;
    /**
     * Get all backup jobs
     */
    getJobs(limit?: number): BackupJob[];
    /**
     * Get a specific backup job
     */
    getJob(backupId: string): BackupJob | undefined;
    private checkSchedule;
    private performBackup;
    private calculateChecksum;
    private encryptFile;
    private cleanupOldBackups;
    private walkDir;
    private formatSize;
    private persist;
}
export declare const backupService: BackupService;
export { BackupService };
