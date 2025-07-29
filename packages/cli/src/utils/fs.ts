/**
 * File system utilities
 */
import fs from 'fs-extra'
import path from 'path'

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath)
}

export async function pathExists(filePath: string): Promise<boolean> {
  return fs.pathExists(filePath)
}

export async function readFile(filePath: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
  return fs.readFile(filePath, encoding)
}

export async function writeFile(filePath: string, data: string, encoding: BufferEncoding = 'utf8'): Promise<void> {
  await fs.ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, data, encoding)
}

export async function copyFile(src: string, dest: string): Promise<void> {
  await fs.ensureDir(path.dirname(dest))
  await fs.copy(src, dest)
}

export async function removeFile(filePath: string): Promise<void> {
  await fs.remove(filePath)
}

export async function readDir(dirPath: string): Promise<string[]> {
  return fs.readdir(dirPath)
}

export async function stat(filePath: string): Promise<fs.Stats> {
  return fs.stat(filePath)
}

export { fs as fsExtra }