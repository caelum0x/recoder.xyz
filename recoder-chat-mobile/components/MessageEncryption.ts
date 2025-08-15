import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

export interface EncryptedMessage {
  content: string;
  iv: string;
  encrypted: boolean;
}

class MessageEncryptionService {
  private static instance: MessageEncryptionService;
  private encryptionKey: string | null = null;

  private constructor() {}

  static getInstance(): MessageEncryptionService {
    if (!MessageEncryptionService.instance) {
      MessageEncryptionService.instance = new MessageEncryptionService();
    }
    return MessageEncryptionService.instance;
  }

  async initialize(): Promise<void> {
    try {
      // Try to get existing key
      this.encryptionKey = await SecureStore.getItemAsync('message_encryption_key');
      
      if (!this.encryptionKey) {
        // Generate new key
        this.encryptionKey = await this.generateEncryptionKey();
        await SecureStore.setItemAsync('message_encryption_key', this.encryptionKey);
      }
    } catch (error) {
      console.error('Failed to initialize message encryption:', error);
      // Fallback to a session-only key
      this.encryptionKey = await this.generateEncryptionKey();
    }
  }

  private async generateEncryptionKey(): Promise<string> {
    // Generate a 256-bit key
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    return Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private async generateIV(): Promise<string> {
    // Generate a 128-bit IV for AES
    const randomBytes = await Crypto.getRandomBytesAsync(16);
    return Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private hexToUint8Array(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  private uint8ArrayToHex(bytes: Uint8Array): string {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async encryptMessage(content: string): Promise<EncryptedMessage> {
    if (!this.encryptionKey) {
      await this.initialize();
    }

    try {
      // For now, we'll use a simple XOR encryption with the key
      // In production, you'd want to use proper AES encryption
      const iv = await this.generateIV();
      const encrypted = await this.xorEncrypt(content, this.encryptionKey!, iv);
      
      return {
        content: encrypted,
        iv,
        encrypted: true,
      };
    } catch (error) {
      console.error('Failed to encrypt message:', error);
      // Return unencrypted as fallback
      return {
        content,
        iv: '',
        encrypted: false,
      };
    }
  }

  async decryptMessage(encryptedMessage: EncryptedMessage): Promise<string> {
    if (!encryptedMessage.encrypted) {
      return encryptedMessage.content;
    }

    if (!this.encryptionKey) {
      await this.initialize();
    }

    try {
      return await this.xorDecrypt(
        encryptedMessage.content,
        this.encryptionKey!,
        encryptedMessage.iv
      );
    } catch (error) {
      console.error('Failed to decrypt message:', error);
      return '[Encrypted message - decryption failed]';
    }
  }

  private async xorEncrypt(text: string, key: string, iv: string): Promise<string> {
    const textBytes = new TextEncoder().encode(text);
    const keyBytes = this.hexToUint8Array(key);
    const ivBytes = this.hexToUint8Array(iv);
    
    const encrypted = new Uint8Array(textBytes.length);
    
    for (let i = 0; i < textBytes.length; i++) {
      const keyIndex = i % keyBytes.length;
      const ivIndex = i % ivBytes.length;
      encrypted[i] = textBytes[i] ^ keyBytes[keyIndex] ^ ivBytes[ivIndex];
    }
    
    return this.uint8ArrayToHex(encrypted);
  }

  private async xorDecrypt(encryptedHex: string, key: string, iv: string): Promise<string> {
    const encryptedBytes = this.hexToUint8Array(encryptedHex);
    const keyBytes = this.hexToUint8Array(key);
    const ivBytes = this.hexToUint8Array(iv);
    
    const decrypted = new Uint8Array(encryptedBytes.length);
    
    for (let i = 0; i < encryptedBytes.length; i++) {
      const keyIndex = i % keyBytes.length;
      const ivIndex = i % ivBytes.length;
      decrypted[i] = encryptedBytes[i] ^ keyBytes[keyIndex] ^ ivBytes[ivIndex];
    }
    
    return new TextDecoder().decode(decrypted);
  }

  isEncryptionEnabled(): boolean {
    return this.encryptionKey !== null;
  }

  async resetEncryption(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync('message_encryption_key');
      this.encryptionKey = null;
      await this.initialize();
    } catch (error) {
      console.error('Failed to reset encryption:', error);
    }
  }
}

export const messageEncryption = MessageEncryptionService.getInstance();