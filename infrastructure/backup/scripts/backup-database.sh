#!/bin/bash

# Automated Database Backup Script for Recoder.xyz
# Supports PostgreSQL with encryption, compression, and multi-cloud storage

set -euo pipefail

# Configuration
BACKUP_NAME="recoder-db-$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/tmp/backups"
LOG_FILE="/var/log/backup-database.log"
ENCRYPTION_KEY_FILE="/etc/backup/encryption.key"
RETENTION_DAYS=30

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    log "${RED}ERROR: $1${NC}"
    cleanup
    exit 1
}

# Cleanup function
cleanup() {
    log "${BLUE}Cleaning up temporary files...${NC}"
    rm -rf "$BACKUP_DIR/$BACKUP_NAME"*
    if [ -f "/tmp/$BACKUP_NAME.sql" ]; then
        rm -f "/tmp/$BACKUP_NAME.sql"
    fi
}

# Check prerequisites
check_prerequisites() {
    log "${BLUE}Checking prerequisites...${NC}"
    
    # Check required tools
    for tool in pg_dump gpg aws gsutil az; do
        if ! command -v "$tool" &> /dev/null; then
            error_exit "$tool is required but not installed"
        fi
    done
    
    # Check environment variables
    if [ -z "${DATABASE_URL:-}" ]; then
        error_exit "DATABASE_URL environment variable is not set"
    fi
    
    # Check encryption key
    if [ ! -f "$ENCRYPTION_KEY_FILE" ]; then
        error_exit "Encryption key file not found: $ENCRYPTION_KEY_FILE"
    fi
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    log "${GREEN}Prerequisites check passed${NC}"
}

# Create database backup
create_backup() {
    log "${BLUE}Creating database backup...${NC}"
    
    local backup_file="/tmp/$BACKUP_NAME.sql"
    
    # Create the backup with compression
    if pg_dump "$DATABASE_URL" \
        --verbose \
        --no-password \
        --format=custom \
        --compress=9 \
        --file="$backup_file"; then
        log "${GREEN}Database backup created successfully${NC}"
    else
        error_exit "Failed to create database backup"
    fi
    
    # Get backup size
    local backup_size=$(du -h "$backup_file" | cut -f1)
    log "${BLUE}Backup size: $backup_size${NC}"
    
    echo "$backup_file"
}

# Encrypt backup
encrypt_backup() {
    local backup_file="$1"
    local encrypted_file="$backup_file.enc"
    
    log "${BLUE}Encrypting backup...${NC}"
    
    if gpg --cipher-algo AES256 \
        --compress-algo 2 \
        --symmetric \
        --batch \
        --yes \
        --passphrase-file "$ENCRYPTION_KEY_FILE" \
        --output "$encrypted_file" \
        "$backup_file"; then
        log "${GREEN}Backup encrypted successfully${NC}"
        rm "$backup_file"  # Remove unencrypted version
        echo "$encrypted_file"
    else
        error_exit "Failed to encrypt backup"
    fi
}

# Upload to AWS S3
upload_to_s3() {
    local backup_file="$1"
    local s3_path="s3://recoder-backups/database/$(date +%Y/%m/%d)/$BACKUP_NAME.sql.enc"
    
    log "${BLUE}Uploading to AWS S3...${NC}"
    
    if aws s3 cp "$backup_file" "$s3_path" \
        --storage-class STANDARD_IA \
        --server-side-encryption AES256; then
        log "${GREEN}Successfully uploaded to S3: $s3_path${NC}"
    else
        error_exit "Failed to upload to S3"
    fi
}

# Upload to Google Cloud Storage
upload_to_gcs() {
    local backup_file="$1"
    local gcs_path="gs://recoder-backups-eu/database/$(date +%Y/%m/%d)/$BACKUP_NAME.sql.enc"
    
    log "${BLUE}Uploading to Google Cloud Storage...${NC}"
    
    if gsutil cp "$backup_file" "$gcs_path"; then
        log "${GREEN}Successfully uploaded to GCS: $gcs_path${NC}"
    else
        log "${YELLOW}Warning: Failed to upload to GCS${NC}"
    fi
}

# Upload to Azure Blob Storage
upload_to_azure() {
    local backup_file="$1"
    local azure_path="https://recoderbackups.blob.core.windows.net/database/$(date +%Y/%m/%d)/$BACKUP_NAME.sql.enc"
    
    log "${BLUE}Uploading to Azure Blob Storage...${NC}"
    
    if az storage blob upload \
        --file "$backup_file" \
        --container-name database \
        --name "$(date +%Y/%m/%d)/$BACKUP_NAME.sql.enc" \
        --account-name recoderbackups; then
        log "${GREEN}Successfully uploaded to Azure: $azure_path${NC}"
    else
        log "${YELLOW}Warning: Failed to upload to Azure${NC}"
    fi
}

# Verify backup integrity
verify_backup() {
    local backup_file="$1"
    
    log "${BLUE}Verifying backup integrity...${NC}"
    
    # Decrypt and test the backup
    local temp_sql="/tmp/verify_$BACKUP_NAME.sql"
    
    if gpg --batch --yes \
        --passphrase-file "$ENCRYPTION_KEY_FILE" \
        --decrypt "$backup_file" > "$temp_sql"; then
        
        # Check if the decrypted file is a valid PostgreSQL backup
        if pg_restore --list "$temp_sql" &> /dev/null; then
            log "${GREEN}Backup integrity verified${NC}"
            rm "$temp_sql"
            return 0
        else
            rm "$temp_sql"
            error_exit "Backup integrity check failed - invalid PostgreSQL backup"
        fi
    else
        error_exit "Backup integrity check failed - decryption failed"
    fi
}

# Clean old backups
cleanup_old_backups() {
    log "${BLUE}Cleaning up old backups...${NC}"
    
    # Clean S3 backups older than retention period
    aws s3api list-objects-v2 \
        --bucket recoder-backups \
        --prefix "database/" \
        --query "Contents[?LastModified<='$(date -d "$RETENTION_DAYS days ago" --iso-8601)'].Key" \
        --output text | \
    while read -r key; do
        if [ ! -z "$key" ] && [ "$key" != "None" ]; then
            aws s3 rm "s3://recoder-backups/$key"
            log "${BLUE}Deleted old backup: $key${NC}"
        fi
    done
    
    log "${GREEN}Old backup cleanup completed${NC}"
}

# Send notification
send_notification() {
    local status="$1"
    local message="$2"
    
    # Send to Slack (if webhook is configured)
    if [ ! -z "${SLACK_WEBHOOK_URL:-}" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🔄 Recoder.xyz Database Backup $status: $message\"}" \
            "$SLACK_WEBHOOK_URL" || true
    fi
    
    # Send email notification (if configured)
    if [ ! -z "${NOTIFICATION_EMAIL:-}" ]; then
        echo "$message" | mail -s "Recoder.xyz Database Backup $status" "$NOTIFICATION_EMAIL" || true
    fi
}

# Main function
main() {
    log "${GREEN}Starting database backup process...${NC}"
    
    # Record start time for metrics
    local start_time=$(date +%s)
    
    check_prerequisites
    
    # Create backup
    local backup_file
    backup_file=$(create_backup)
    
    # Encrypt backup
    local encrypted_file
    encrypted_file=$(encrypt_backup "$backup_file")
    
    # Verify backup integrity
    verify_backup "$encrypted_file"
    
    # Upload to multiple destinations
    upload_to_s3 "$encrypted_file"
    upload_to_gcs "$encrypted_file"
    upload_to_azure "$encrypted_file"
    
    # Cleanup old backups
    cleanup_old_backups
    
    # Calculate duration
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Success notification
    local success_message="Database backup completed successfully in ${duration}s. Backup: $BACKUP_NAME"
    log "${GREEN}$success_message${NC}"
    send_notification "SUCCESS" "$success_message"
    
    # Cleanup
    cleanup
    
    # Export metrics for monitoring
    echo "backup_duration_seconds{service=\"database\"} $duration" > /var/lib/node_exporter/textfile_collector/backup_database.prom
    echo "backup_success{service=\"database\"} 1" >> /var/lib/node_exporter/textfile_collector/backup_database.prom
    echo "backup_timestamp{service=\"database\"} $end_time" >> /var/lib/node_exporter/textfile_collector/backup_database.prom
}

# Trap for error handling
trap 'error_exit "Script interrupted"' INT TERM

# Run main function
main "$@"