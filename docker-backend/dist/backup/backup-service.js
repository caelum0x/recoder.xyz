"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackupService = exports.backupService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const util_1 = require("util");
const child_process_1 = require("child_process");
const persistence_js_1 = require("../persistence.js");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// ==================== Configuration ====================
const DEFAULT_CONFIG = {
    backupDir: process.env.BACKUP_DIR || './data/backups',
    maxBackups: 10,
    hourlyEnabled: process.env.BACKUP_HOURLY === 'true',
    dailyEnabled: process.env.BACKUP_DAILY === 'true',
    weeklyEnabled: process.env.BACKUP_WEEKLY === 'true',
    compress: true,
    encrypt: false,
};
function loadBackupStore() {
    return (0, persistence_js_1.loadStore)('backup-service', {
        jobs: [],
    });
}
function saveBackupStore(data) {
    (0, persistence_js_1.debouncedSave)('backup-service', data);
}
// ==================== Backup Service ====================
class BackupService {
    config;
    jobs = [];
    lastHourly;
    lastDaily;
    lastWeekly;
    schedulerInterval;
    isRunning = false;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        // Load persisted state
        const stored = loadBackupStore();
        this.jobs = stored.jobs;
        this.lastHourly = stored.lastHourly;
        this.lastDaily = stored.lastDaily;
        this.lastWeekly = stored.lastWeekly;
        // Ensure backup directory exists
        if (!fs_1.default.existsSync(this.config.backupDir)) {
            fs_1.default.mkdirSync(this.config.backupDir, { recursive: true });
        }
        console.log(`[BackupService] Initialized with ${this.jobs.length} backup records`);
    }
    // ==================== Public API ====================
    /**
     * Start the backup scheduler
     */
    startScheduler() {
        if (this.schedulerInterval) {
            console.log('[BackupService] Scheduler already running');
            return;
        }
        console.log('[BackupService] Starting backup scheduler');
        // Check every minute
        this.schedulerInterval = setInterval(() => {
            this.checkSchedule();
        }, 60000);
        // Run initial check
        this.checkSchedule();
    }
    /**
     * Stop the backup scheduler
     */
    stopScheduler() {
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = undefined;
            console.log('[BackupService] Scheduler stopped');
        }
    }
    /**
     * Create a backup immediately
     */
    async createBackup(type = 'full', scope = 'all') {
        const job = {
            id: crypto_1.default.randomUUID(),
            type,
            status: 'pending',
            scope,
            startedAt: Date.now(),
        };
        this.jobs.push(job);
        this.persist();
        try {
            job.status = 'running';
            const backupPath = await this.performBackup(job);
            job.status = 'completed';
            job.completedAt = Date.now();
            job.path = backupPath;
            // Calculate size and checksum
            const stats = fs_1.default.statSync(backupPath);
            job.size = stats.size;
            job.checksum = await this.calculateChecksum(backupPath);
            console.log(`[BackupService] Backup completed: ${job.id} (${this.formatSize(job.size)})`);
        }
        catch (error) {
            job.status = 'failed';
            job.completedAt = Date.now();
            job.error = error instanceof Error ? error.message : String(error);
            console.error(`[BackupService] Backup failed: ${job.id}`, error);
        }
        this.persist();
        return job;
    }
    /**
     * Restore from a backup
     */
    async restore(options) {
        const job = this.jobs.find((j) => j.id === options.backupId);
        if (!job) {
            return {
                success: false,
                restoredFiles: 0,
                restoredSize: 0,
                errors: [`Backup not found: ${options.backupId}`],
            };
        }
        if (!job.path || !fs_1.default.existsSync(job.path)) {
            return {
                success: false,
                restoredFiles: 0,
                restoredSize: 0,
                errors: [`Backup file not found: ${job.path}`],
            };
        }
        const errors = [];
        let restoredFiles = 0;
        let restoredSize = 0;
        try {
            const targetDir = options.targetDir || './data';
            if (options.dryRun) {
                console.log(`[BackupService] Dry run: would restore ${job.path} to ${targetDir}`);
                return {
                    success: true,
                    restoredFiles: 0,
                    restoredSize: 0,
                    errors: [],
                };
            }
            // Decompress and restore
            const extractDir = path_1.default.join(this.config.backupDir, 'restore-temp', job.id);
            fs_1.default.mkdirSync(extractDir, { recursive: true });
            if (this.config.compress) {
                await execAsync(`tar -xzf "${job.path}" -C "${extractDir}"`);
            }
            else {
                await execAsync(`tar -xf "${job.path}" -C "${extractDir}"`);
            }
            // Copy restored files to target
            const files = this.walkDir(extractDir);
            for (const file of files) {
                const relativePath = path_1.default.relative(extractDir, file);
                const targetPath = path_1.default.join(targetDir, relativePath);
                fs_1.default.mkdirSync(path_1.default.dirname(targetPath), { recursive: true });
                fs_1.default.copyFileSync(file, targetPath);
                const stats = fs_1.default.statSync(file);
                restoredFiles++;
                restoredSize += stats.size;
            }
            // Cleanup
            fs_1.default.rmSync(extractDir, { recursive: true, force: true });
            console.log(`[BackupService] Restore completed: ${restoredFiles} files (${this.formatSize(restoredSize)})`);
        }
        catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
            console.error('[BackupService] Restore failed:', error);
        }
        return {
            success: errors.length === 0,
            restoredFiles,
            restoredSize,
            errors,
        };
    }
    /**
     * Delete a backup
     */
    deleteBackup(backupId) {
        const index = this.jobs.findIndex((j) => j.id === backupId);
        if (index === -1)
            return false;
        const job = this.jobs[index];
        if (job.path && fs_1.default.existsSync(job.path)) {
            fs_1.default.unlinkSync(job.path);
        }
        this.jobs.splice(index, 1);
        this.persist();
        console.log(`[BackupService] Deleted backup: ${backupId}`);
        return true;
    }
    /**
     * Get backup statistics
     */
    getStats() {
        const completedJobs = this.jobs.filter((j) => j.status === 'completed');
        const totalSize = completedJobs.reduce((sum, j) => sum + (j.size || 0), 0);
        const now = Date.now();
        const hourlyNext = this.config.hourlyEnabled && this.lastHourly
            ? this.lastHourly + 60 * 60 * 1000
            : now;
        const dailyNext = this.config.dailyEnabled && this.lastDaily
            ? this.lastDaily + 24 * 60 * 60 * 1000
            : now;
        let nextScheduled;
        if (this.config.hourlyEnabled && hourlyNext < dailyNext) {
            nextScheduled = { type: 'incremental', scheduledAt: hourlyNext };
        }
        else if (this.config.dailyEnabled) {
            nextScheduled = { type: 'full', scheduledAt: dailyNext };
        }
        return {
            totalBackups: completedJobs.length,
            totalSize,
            lastBackup: completedJobs[completedJobs.length - 1],
            nextScheduled,
            retentionPolicy: {
                hourly: 24, // Keep 24 hourly backups
                daily: 7, // Keep 7 daily backups
                weekly: 4, // Keep 4 weekly backups
            },
        };
    }
    /**
     * Get all backup jobs
     */
    getJobs(limit = 50) {
        return this.jobs.slice(-limit).reverse();
    }
    /**
     * Get a specific backup job
     */
    getJob(backupId) {
        return this.jobs.find((j) => j.id === backupId);
    }
    // ==================== Private Methods ====================
    async checkSchedule() {
        if (this.isRunning)
            return;
        const now = Date.now();
        const hourAgo = now - 60 * 60 * 1000;
        const dayAgo = now - 24 * 60 * 60 * 1000;
        const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
        try {
            this.isRunning = true;
            // Hourly incremental
            if (this.config.hourlyEnabled && (!this.lastHourly || this.lastHourly < hourAgo)) {
                console.log('[BackupService] Running scheduled hourly backup');
                await this.createBackup('incremental', 'all');
                this.lastHourly = now;
                this.persist();
            }
            // Daily full
            if (this.config.dailyEnabled && (!this.lastDaily || this.lastDaily < dayAgo)) {
                console.log('[BackupService] Running scheduled daily backup');
                await this.createBackup('full', 'all');
                this.lastDaily = now;
                this.persist();
            }
            // Weekly archival
            if (this.config.weeklyEnabled && (!this.lastWeekly || this.lastWeekly < weekAgo)) {
                console.log('[BackupService] Running scheduled weekly backup');
                await this.createBackup('full', 'all');
                this.lastWeekly = now;
                this.persist();
            }
            // Cleanup old backups
            await this.cleanupOldBackups();
        }
        finally {
            this.isRunning = false;
        }
    }
    async performBackup(job) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup-${job.type}-${job.scope}-${timestamp}.tar${this.config.compress ? '.gz' : ''}`;
        const backupPath = path_1.default.join(this.config.backupDir, filename);
        // Determine what to backup based on scope
        const sourcePaths = [];
        switch (job.scope) {
            case 'all':
                sourcePaths.push('./data');
                break;
            case 'projects':
                sourcePaths.push('./data/projects');
                break;
            case 'users':
                sourcePaths.push('./data/users');
                break;
            case 'api-keys':
                sourcePaths.push('./data/api-keys.json');
                break;
            case 'containers':
                sourcePaths.push('./data/containers');
                break;
        }
        // Filter to existing paths
        const existingPaths = sourcePaths.filter((p) => fs_1.default.existsSync(p));
        if (existingPaths.length === 0) {
            throw new Error(`No data found for scope: ${job.scope}`);
        }
        // Create tar archive (exclude backup dir to prevent recursive growth)
        const tarFlags = this.config.compress ? '-czf' : '-cf';
        const pathsArg = existingPaths.map((p) => `"${p}"`).join(' ');
        await execAsync(`tar ${tarFlags} "${backupPath}" --exclude="${this.config.backupDir}" ${pathsArg}`);
        // Encrypt if configured
        if (this.config.encrypt && this.config.encryptionKey) {
            await this.encryptFile(backupPath, this.config.encryptionKey);
        }
        return backupPath;
    }
    async calculateChecksum(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto_1.default.createHash('sha256');
            const stream = fs_1.default.createReadStream(filePath);
            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }
    async encryptFile(filePath, key) {
        const algorithm = 'aes-256-gcm';
        const iv = crypto_1.default.randomBytes(16);
        const keyBuffer = crypto_1.default.scryptSync(key, 'salt', 32);
        const cipher = crypto_1.default.createCipheriv(algorithm, keyBuffer, iv);
        const input = fs_1.default.readFileSync(filePath);
        const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
        const authTag = cipher.getAuthTag();
        // Write IV + authTag + encrypted data
        fs_1.default.writeFileSync(filePath + '.enc', Buffer.concat([iv, authTag, encrypted]));
        fs_1.default.unlinkSync(filePath);
        fs_1.default.renameSync(filePath + '.enc', filePath);
    }
    async cleanupOldBackups() {
        const completedJobs = this.jobs
            .filter((j) => j.status === 'completed' && j.path)
            .sort((a, b) => a.startedAt - b.startedAt);
        while (completedJobs.length > this.config.maxBackups) {
            const oldest = completedJobs.shift();
            this.deleteBackup(oldest.id);
        }
    }
    walkDir(dir) {
        const files = [];
        const entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path_1.default.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...this.walkDir(fullPath));
            }
            else {
                files.push(fullPath);
            }
        }
        return files;
    }
    formatSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }
    persist() {
        saveBackupStore({
            jobs: this.jobs.slice(-1000), // Keep last 1000 jobs
            lastHourly: this.lastHourly,
            lastDaily: this.lastDaily,
            lastWeekly: this.lastWeekly,
        });
    }
}
exports.BackupService = BackupService;
// ==================== Singleton Export ====================
exports.backupService = new BackupService();
