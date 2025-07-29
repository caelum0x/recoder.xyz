/**
 * Storage utilities for configuration and cache
 */
import fs from 'fs-extra'
import path from 'path'
import os from 'os'

export interface StorageAdapter {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<boolean>
  has(key: string): Promise<boolean>
  clear(): Promise<void>
}

export class FileStorageAdapter implements StorageAdapter {
  private storageDir: string

  constructor(storageDir?: string) {
    this.storageDir = storageDir || path.join(os.homedir(), '.recoder', 'storage')
  }

  private getFilePath(key: string): string {
    // Sanitize key for filesystem
    const sanitizedKey = key.replace(/[^a-zA-Z0-9-_]/g, '_')
    return path.join(this.storageDir, `${sanitizedKey}.json`)
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const filePath = this.getFilePath(key)
      if (await fs.pathExists(filePath)) {
        return await fs.readJson(filePath)
      }
      return undefined
    } catch (error) {
      console.error(`Storage get error for key ${key}:`, error)
      return undefined
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      const filePath = this.getFilePath(key)
      await fs.ensureDir(path.dirname(filePath))
      await fs.writeJson(filePath, value, { spaces: 2 })
    } catch (error) {
      console.error(`Storage set error for key ${key}:`, error)
      throw error
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(key)
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath)
        return true
      }
      return false
    } catch (error) {
      console.error(`Storage delete error for key ${key}:`, error)
      return false
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(key)
      return await fs.pathExists(filePath)
    } catch (error) {
      console.error(`Storage has error for key ${key}:`, error)
      return false
    }
  }

  async clear(): Promise<void> {
    try {
      if (await fs.pathExists(this.storageDir)) {
        await fs.emptyDir(this.storageDir)
      }
    } catch (error) {
      console.error('Storage clear error:', error)
      throw error
    }
  }
}

// Default instance
export const storage = new FileStorageAdapter()