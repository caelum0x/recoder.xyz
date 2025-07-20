/**
 * End-to-End Data Encryption System
 * Provides comprehensive encryption for user data, API communications, and file storage
 * with key management, rotation, and compliance features
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHash, createHmac } from 'crypto';
import { promisify } from 'util';
import forge from 'node-forge';
import { Logger } from '@recoder/shared';

export interface EncryptionConfig {
  algorithm: 'aes-256-gcm' | 'aes-256-cbc' | 'chacha20-poly1305';
  keyDerivation: 'pbkdf2' | 'scrypt' | 'argon2';
  keySize: 256 | 512;
  ivSize: 12 | 16;
  tagSize: 16;
  iterations: number;
  saltSize: 32;
  compressionEnabled: boolean;
  keyRotationDays: number;
}

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag?: string;
  salt: string;
  algorithm: string;
  keyVersion: string;
  timestamp: number;
  metadata?: {
    compressed: boolean;
    originalSize?: number;
    checksum: string;
  };
}

export interface KeyMetadata {
  id: string;
  version: string;
  algorithm: string;
  created: number;
  lastUsed: number;
  rotationDue: number;
  purpose: 'encryption' | 'signing' | 'kdf';
  status: 'active' | 'deprecated' | 'revoked';
}

export interface EncryptionContext {
  userId?: string;
  dataType: 'user_data' | 'api_key' | 'file' | 'config' | 'logs';
  purpose: string;
  retentionDays?: number;
  complianceLevel: 'standard' | 'gdpr' | 'hipaa' | 'sox';
}

export class DataEncryption {
  private readonly logger = new Logger('DataEncryption');
  private readonly config: EncryptionConfig;
  private readonly masterKeys = new Map<string, Buffer>();
  private readonly keyMetadata = new Map<string, KeyMetadata>();
  private currentKeyVersion = '1';

  constructor(config?: Partial<EncryptionConfig>) {
    this.config = {
      algorithm: 'aes-256-gcm',
      keyDerivation: 'pbkdf2',
      keySize: 256,
      ivSize: 12,
      tagSize: 16,
      iterations: 100000,
      saltSize: 32,
      compressionEnabled: true,
      keyRotationDays: 90,
      ...config,
    };

    this.initializeMasterKey();
  }

  /**
   * Encrypt data with context and metadata
   */
  async encryptData(
    data: string | Buffer,
    context: EncryptionContext,
    password?: string
  ): Promise<EncryptedData> {
    this.logger.debug(`Encrypting ${context.dataType} data`);

    try {
      // Get or derive encryption key
      const key = password 
        ? await this.deriveKeyFromPassword(password)
        : await this.getCurrentEncryptionKey();

      // Convert data to buffer
      let dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      let compressed = false;
      let originalSize = dataBuffer.length;

      // Apply compression if enabled and beneficial
      if (this.config.compressionEnabled && dataBuffer.length > 1024) {
        const compressedData = await this.compressData(dataBuffer);
        if (compressedData.length < dataBuffer.length * 0.9) {
          dataBuffer = compressedData;
          compressed = true;
        }
      }

      // Generate IV and salt
      const iv = randomBytes(this.config.ivSize);
      const salt = randomBytes(this.config.saltSize);

      // Create cipher
      const cipher = createCipheriv(this.config.algorithm, key, iv);
      
      // Encrypt data
      const encrypted = Buffer.concat([
        cipher.update(dataBuffer),
        cipher.final(),
      ]);

      // Get authentication tag (for GCM mode)
      const tag = this.config.algorithm.includes('gcm') 
        ? (cipher as any).getAuthTag()
        : undefined;

      // Calculate checksum
      const checksum = createHash('sha256').update(dataBuffer).digest('hex');

      const result: EncryptedData = {
        ciphertext: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag?.toString('base64'),
        salt: salt.toString('base64'),
        algorithm: this.config.algorithm,
        keyVersion: this.currentKeyVersion,
        timestamp: Date.now(),
        metadata: {
          compressed,
          originalSize: compressed ? originalSize : undefined,
          checksum,
        },
      };

      // Log encryption event (without sensitive data)
      await this.logEncryptionEvent('encrypt', context, {
        keyVersion: this.currentKeyVersion,
        algorithm: this.config.algorithm,
        dataSize: dataBuffer.length,
        compressed,
      });

      return result;

    } catch (error) {
      this.logger.error('Encryption failed:', error);
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt data with validation and integrity checks
   */
  async decryptData(
    encryptedData: EncryptedData,
    context: EncryptionContext,
    password?: string
  ): Promise<string | Buffer> {
    this.logger.debug(`Decrypting ${context.dataType} data`);

    try {
      // Get decryption key
      const key = password 
        ? await this.deriveKeyFromPassword(password, Buffer.from(encryptedData.salt, 'base64'))
        : await this.getEncryptionKey(encryptedData.keyVersion);

      // Decode encrypted components
      const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const tag = encryptedData.tag ? Buffer.from(encryptedData.tag, 'base64') : undefined;

      // Create decipher
      const decipher = createDecipheriv(encryptedData.algorithm, key, iv);
      
      // Set auth tag for GCM mode
      if (tag && encryptedData.algorithm.includes('gcm')) {
        (decipher as any).setAuthTag(tag);
      }

      // Decrypt data
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      // Decompress if needed
      let finalData = decrypted;
      if (encryptedData.metadata?.compressed) {
        finalData = await this.decompressData(decrypted);
      }

      // Verify checksum
      if (encryptedData.metadata?.checksum) {
        const calculatedChecksum = createHash('sha256').update(finalData).digest('hex');
        if (calculatedChecksum !== encryptedData.metadata.checksum) {
          throw new Error('Data integrity check failed - checksum mismatch');
        }
      }

      // Log decryption event
      await this.logEncryptionEvent('decrypt', context, {
        keyVersion: encryptedData.keyVersion,
        algorithm: encryptedData.algorithm,
        dataSize: finalData.length,
        compressed: encryptedData.metadata?.compressed || false,
      });

      // Update key usage
      await this.updateKeyUsage(encryptedData.keyVersion);

      return finalData;

    } catch (error) {
      this.logger.error('Decryption failed:', error);
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Encrypt file with streaming support for large files
   */
  async encryptFile(
    inputPath: string,
    outputPath: string,
    context: EncryptionContext
  ): Promise<EncryptedData> {
    const fs = require('fs-extra');
    const { pipeline } = require('stream');
    const { createReadStream, createWriteStream } = require('fs');

    this.logger.info(`Encrypting file: ${inputPath}`);

    try {
      const key = await this.getCurrentEncryptionKey();
      const iv = randomBytes(this.config.ivSize);
      const salt = randomBytes(this.config.saltSize);

      // Get file stats
      const stats = await fs.stat(inputPath);
      const originalSize = stats.size;

      // Create cipher stream
      const cipher = createCipheriv(this.config.algorithm, key, iv);
      
      // Setup file streams
      const readStream = createReadStream(inputPath);
      const writeStream = createWriteStream(outputPath);

      // Calculate checksum while reading
      const hashStream = createHash('sha256');
      readStream.on('data', chunk => hashStream.update(chunk));

      // Encrypt file
      await promisify(pipeline)(readStream, cipher, writeStream);

      // Get authentication tag
      const tag = this.config.algorithm.includes('gcm') 
        ? (cipher as any).getAuthTag()
        : undefined;

      const checksum = hashStream.digest('hex');

      const result: EncryptedData = {
        ciphertext: outputPath, // File path instead of base64
        iv: iv.toString('base64'),
        tag: tag?.toString('base64'),
        salt: salt.toString('base64'),
        algorithm: this.config.algorithm,
        keyVersion: this.currentKeyVersion,
        timestamp: Date.now(),
        metadata: {
          compressed: false,
          originalSize,
          checksum,
        },
      };

      await this.logEncryptionEvent('encrypt_file', context, {
        keyVersion: this.currentKeyVersion,
        algorithm: this.config.algorithm,
        dataSize: originalSize,
        filePath: inputPath,
      });

      return result;

    } catch (error) {
      this.logger.error('File encryption failed:', error);
      throw new Error(`File encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt file with streaming support
   */
  async decryptFile(
    encryptedData: EncryptedData,
    outputPath: string,
    context: EncryptionContext
  ): Promise<void> {
    const { pipeline } = require('stream');
    const { createReadStream, createWriteStream } = require('fs');

    this.logger.info(`Decrypting file to: ${outputPath}`);

    try {
      const key = await this.getEncryptionKey(encryptedData.keyVersion);
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const tag = encryptedData.tag ? Buffer.from(encryptedData.tag, 'base64') : undefined;

      // Create decipher stream
      const decipher = createDecipheriv(encryptedData.algorithm, key, iv);
      
      if (tag && encryptedData.algorithm.includes('gcm')) {
        (decipher as any).setAuthTag(tag);
      }

      // Setup file streams
      const readStream = createReadStream(encryptedData.ciphertext); // File path
      const writeStream = createWriteStream(outputPath);

      // Calculate checksum while writing
      const hashStream = createHash('sha256');
      writeStream.on('pipe', () => {
        writeStream.on('data', chunk => hashStream.update(chunk));
      });

      // Decrypt file
      await promisify(pipeline)(readStream, decipher, writeStream);

      // Verify checksum
      if (encryptedData.metadata?.checksum) {
        const calculatedChecksum = hashStream.digest('hex');
        if (calculatedChecksum !== encryptedData.metadata.checksum) {
          throw new Error('File integrity check failed - checksum mismatch');
        }
      }

      await this.logEncryptionEvent('decrypt_file', context, {
        keyVersion: encryptedData.keyVersion,
        algorithm: encryptedData.algorithm,
        filePath: outputPath,
      });

    } catch (error) {
      this.logger.error('File decryption failed:', error);
      throw new Error(`File decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate RSA key pair for asymmetric encryption
   */
  async generateRSAKeyPair(keySize: 2048 | 3072 | 4096 = 2048): Promise<{
    publicKey: string;
    privateKey: string;
    keyId: string;
  }> {
    this.logger.info(`Generating RSA key pair (${keySize} bits)`);

    const keypair = forge.pki.rsa.generateKeyPair(keySize);
    const publicKeyPem = forge.pki.publicKeyToPem(keypair.publicKey);
    const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);
    
    const keyId = this.generateKeyId();

    // Store key metadata
    const metadata: KeyMetadata = {
      id: keyId,
      version: this.currentKeyVersion,
      algorithm: `rsa-${keySize}`,
      created: Date.now(),
      lastUsed: Date.now(),
      rotationDue: Date.now() + (this.config.keyRotationDays * 24 * 60 * 60 * 1000),
      purpose: 'encryption',
      status: 'active',
    };

    this.keyMetadata.set(keyId, metadata);

    return {
      publicKey: publicKeyPem,
      privateKey: privateKeyPem,
      keyId,
    };
  }

  /**
   * Encrypt with RSA public key
   */
  async encryptWithRSA(data: string, publicKeyPem: string): Promise<string> {
    try {
      const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
      const encrypted = publicKey.encrypt(data, 'RSA-OAEP', {
        md: forge.md.sha256.create(),
        mgf1: forge.mgf.mgf1.create(forge.md.sha256.create()),
      });
      
      return forge.util.encode64(encrypted);
    } catch (error) {
      this.logger.error('RSA encryption failed:', error);
      throw new Error(`RSA encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt with RSA private key
   */
  async decryptWithRSA(encryptedData: string, privateKeyPem: string): Promise<string> {
    try {
      const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
      const encrypted = forge.util.decode64(encryptedData);
      const decrypted = privateKey.decrypt(encrypted, 'RSA-OAEP', {
        md: forge.md.sha256.create(),
        mgf1: forge.mgf.mgf1.create(forge.md.sha256.create()),
      });
      
      return decrypted;
    } catch (error) {
      this.logger.error('RSA decryption failed:', error);
      throw new Error(`RSA decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sign data with RSA private key
   */
  async signData(data: string, privateKeyPem: string): Promise<string> {
    try {
      const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
      const md = forge.md.sha256.create();
      md.update(data, 'utf8');
      
      const signature = privateKey.sign(md);
      return forge.util.encode64(signature);
    } catch (error) {
      this.logger.error('Data signing failed:', error);
      throw new Error(`Data signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify signature with RSA public key
   */
  async verifySignature(data: string, signature: string, publicKeyPem: string): Promise<boolean> {
    try {
      const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
      const md = forge.md.sha256.create();
      md.update(data, 'utf8');
      
      const signatureBytes = forge.util.decode64(signature);
      return publicKey.verify(md.digest().bytes(), signatureBytes);
    } catch (error) {
      this.logger.error('Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Rotate encryption keys
   */
  async rotateKeys(): Promise<void> {
    this.logger.info('Starting key rotation');

    try {
      // Create new key version
      const newVersion = (parseInt(this.currentKeyVersion) + 1).toString();
      
      // Generate new master key
      const newMasterKey = randomBytes(this.config.keySize / 8);
      this.masterKeys.set(newVersion, newMasterKey);
      
      // Update metadata for old key
      const oldMetadata = this.keyMetadata.get(this.currentKeyVersion);
      if (oldMetadata) {
        oldMetadata.status = 'deprecated';
        this.keyMetadata.set(this.currentKeyVersion, oldMetadata);
      }
      
      // Create metadata for new key
      const newMetadata: KeyMetadata = {
        id: this.generateKeyId(),
        version: newVersion,
        algorithm: this.config.algorithm,
        created: Date.now(),
        lastUsed: Date.now(),
        rotationDue: Date.now() + (this.config.keyRotationDays * 24 * 60 * 60 * 1000),
        purpose: 'encryption',
        status: 'active',
      };
      
      this.keyMetadata.set(newVersion, newMetadata);
      this.currentKeyVersion = newVersion;
      
      this.logger.info(`Key rotation completed. New version: ${newVersion}`);
      
      // Schedule cleanup of old keys (after grace period)
      setTimeout(() => {
        this.cleanupOldKeys();
      }, 30 * 24 * 60 * 60 * 1000); // 30 days

    } catch (error) {
      this.logger.error('Key rotation failed:', error);
      throw error;
    }
  }

  /**
   * Get encryption statistics
   */
  getEncryptionStats(): {
    currentKeyVersion: string;
    totalKeys: number;
    algorithm: string;
    keyRotationDue: number;
    activeKeys: number;
    deprecatedKeys: number;
  } {
    const activeKeys = Array.from(this.keyMetadata.values()).filter(k => k.status === 'active').length;
    const deprecatedKeys = Array.from(this.keyMetadata.values()).filter(k => k.status === 'deprecated').length;
    
    const currentMetadata = this.keyMetadata.get(this.currentKeyVersion);
    const rotationDue = currentMetadata?.rotationDue || 0;

    return {
      currentKeyVersion: this.currentKeyVersion,
      totalKeys: this.masterKeys.size,
      algorithm: this.config.algorithm,
      keyRotationDue: rotationDue,
      activeKeys,
      deprecatedKeys,
    };
  }

  /**
   * Initialize master encryption key
   */
  private initializeMasterKey(): void {
    // In production, this would load from secure key management service
    const masterKey = process.env.ENCRYPTION_MASTER_KEY 
      ? Buffer.from(process.env.ENCRYPTION_MASTER_KEY, 'hex')
      : randomBytes(this.config.keySize / 8);

    this.masterKeys.set(this.currentKeyVersion, masterKey);

    // Create initial metadata
    const metadata: KeyMetadata = {
      id: this.generateKeyId(),
      version: this.currentKeyVersion,
      algorithm: this.config.algorithm,
      created: Date.now(),
      lastUsed: Date.now(),
      rotationDue: Date.now() + (this.config.keyRotationDays * 24 * 60 * 60 * 1000),
      purpose: 'encryption',
      status: 'active',
    };

    this.keyMetadata.set(this.currentKeyVersion, metadata);
  }

  /**
   * Get current encryption key
   */
  private async getCurrentEncryptionKey(): Promise<Buffer> {
    const key = this.masterKeys.get(this.currentKeyVersion);
    if (!key) {
      throw new Error('Master encryption key not found');
    }
    return key;
  }

  /**
   * Get encryption key by version
   */
  private async getEncryptionKey(version: string): Promise<Buffer> {
    const key = this.masterKeys.get(version);
    if (!key) {
      throw new Error(`Encryption key version ${version} not found`);
    }
    return key;
  }

  /**
   * Derive key from password using PBKDF2
   */
  private async deriveKeyFromPassword(password: string, salt?: Buffer): Promise<Buffer> {
    const derivationSalt = salt || randomBytes(this.config.saltSize);
    
    return pbkdf2Sync(
      password,
      derivationSalt,
      this.config.iterations,
      this.config.keySize / 8,
      'sha256'
    );
  }

  /**
   * Compress data using gzip
   */
  private async compressData(data: Buffer): Promise<Buffer> {
    const zlib = require('zlib');
    return promisify(zlib.gzip)(data);
  }

  /**
   * Decompress data using gzip
   */
  private async decompressData(data: Buffer): Promise<Buffer> {
    const zlib = require('zlib');
    return promisify(zlib.gunzip)(data);
  }

  /**
   * Generate unique key ID
   */
  private generateKeyId(): string {
    return createHash('sha256')
      .update(randomBytes(32))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Log encryption events for audit trail
   */
  private async logEncryptionEvent(
    operation: string,
    context: EncryptionContext,
    metadata: any
  ): Promise<void> {
    const event = {
      timestamp: new Date().toISOString(),
      operation,
      userId: context.userId,
      dataType: context.dataType,
      purpose: context.purpose,
      complianceLevel: context.complianceLevel,
      ...metadata,
    };

    this.logger.info('Encryption event', event);
  }

  /**
   * Update key usage timestamp
   */
  private async updateKeyUsage(version: string): Promise<void> {
    const metadata = this.keyMetadata.get(version);
    if (metadata) {
      metadata.lastUsed = Date.now();
      this.keyMetadata.set(version, metadata);
    }
  }

  /**
   * Cleanup old deprecated keys
   */
  private cleanupOldKeys(): void {
    const cutoffTime = Date.now() - (90 * 24 * 60 * 60 * 1000); // 90 days ago
    
    for (const [version, metadata] of this.keyMetadata) {
      if (metadata.status === 'deprecated' && metadata.lastUsed < cutoffTime) {
        this.masterKeys.delete(version);
        this.keyMetadata.delete(version);
        this.logger.info(`Cleaned up old key version: ${version}`);
      }
    }
  }
}