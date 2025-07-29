/**
 * Safe JSON file writing utilities
 */
import fs from 'fs-extra'
import path from 'path'

export async function safeWriteJson(filePath: string, data: any): Promise<void> {
  try {
    // Ensure directory exists
    await fs.ensureDir(path.dirname(filePath))
    
    // Write JSON with proper formatting
    await fs.writeJson(filePath, data, { spaces: 2 })
  } catch (error) {
    console.error(`Failed to write JSON to ${filePath}:`, error)
    throw error
  }
}

export async function safeReadJson<T = any>(filePath: string, defaultValue?: T): Promise<T | undefined> {
  try {
    if (await fs.pathExists(filePath)) {
      return await fs.readJson(filePath)
    }
    return defaultValue
  } catch (error) {
    console.error(`Failed to read JSON from ${filePath}:`, error)
    return defaultValue
  }
}