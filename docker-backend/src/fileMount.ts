import Docker from 'dockerode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

// Use execFile (argument array, no shell) to prevent command injection via
// attacker-controlled file/dir paths. See CVE-class: command-injection.
const execFileAsync = promisify(execFile);
const docker = new Docker();

export interface MountedFile {
  hostPath: string;
  containerPath: string;
}

/**
 * Copy files into running container
 */
export async function mountFiles(
  containerId: string,
  files: string[]
): Promise<MountedFile[]> {
  const container = docker.getContainer(containerId);
  const mounted: MountedFile[] = [];

  for (const filePath of files) {
    try {
      const stat = await fs.stat(filePath);
      
      if (stat.isDirectory()) {
        const containerPath = await mountDirectory(containerId, filePath);
        mounted.push({ hostPath: filePath, containerPath });
      } else {
        const fileName = path.basename(filePath);
        const containerPath = `/workspace/${fileName}`;
        
        // Create tar archive of single file
        const tarPath = `/tmp/mount-${Date.now()}.tar`;
        await execFileAsync('tar', ['-cf', tarPath, '-C', path.dirname(filePath), fileName]);
        
        // Upload to container
        await container.putArchive(createReadStream(tarPath), { path: '/workspace' });
        
        // Cleanup
        await fs.unlink(tarPath);
        
        mounted.push({ hostPath: filePath, containerPath });
        console.log(`✅ Mounted: ${fileName} → ${containerPath}`);
      }
    } catch (err: any) {
      console.error(`❌ Failed to mount ${filePath}:`, err.message);
    }
  }

  return mounted;
}

/**
 * Copy directory into container
 */
export async function mountDirectory(
  containerId: string,
  dirPath: string
): Promise<string> {
  const container = docker.getContainer(containerId);
  const dirName = path.basename(dirPath);
  const containerPath = `/workspace/${dirName}`;
  
  // Create tar archive of directory
  const tarPath = `/tmp/mount-dir-${Date.now()}.tar`;
  await execFileAsync('tar', ['-cf', tarPath, '-C', path.dirname(dirPath), dirName]);
  
  // Upload to container
  await container.putArchive(createReadStream(tarPath), { path: '/workspace' });
  
  // Cleanup
  await fs.unlink(tarPath);
  
  console.log(`✅ Mounted dir: ${dirName} → ${containerPath}`);
  return containerPath;
}
