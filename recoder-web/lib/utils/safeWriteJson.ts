/**
 * Safely writes JSON data to a file
 */
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

export async function safeWriteJson(filePath: string, data: any): Promise<void> {
  try {
    // Ensure directory exists
    await mkdir(dirname(filePath), { recursive: true });
    
    // Write JSON data
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(`Failed to write JSON to ${filePath}:`, error);
    throw error;
  }
}