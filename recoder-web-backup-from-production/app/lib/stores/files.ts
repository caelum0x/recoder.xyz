import { map, type MapStore } from 'nanostores';

export interface File {
  type: 'file';
  content: string;
  isBinary: boolean;
}

export interface Folder {
  type: 'folder';
}

type Dirent = File | Folder;

export type FileMap = Record<string, Dirent | undefined>;

const WORK_DIR = '/home/project';

export class FilesStore {
  files: MapStore<FileMap> = map({});

  get filesCount(): number {
    return Object.keys(this.files.get()).length;
  }

  // Called by ActionRunner when a file is created
  setFile(filePath: string, content: string) {
    const fullPath = filePath.startsWith('/') ? filePath : `${WORK_DIR}/${filePath}`;
    const currentFiles = this.files.get();
    
    // Create parent folders
    const parts = fullPath.split('/').filter(Boolean);
    let folderPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      folderPath += '/' + parts[i];
      if (!currentFiles[folderPath]) {
        currentFiles[folderPath] = { type: 'folder' };
      }
    }
    
    // Set the file
    this.files.set({
      ...currentFiles,
      [fullPath]: { type: 'file', content, isBinary: false },
    });
  }

  // Called by ActionRunner when a folder is created
  setFolder(folderPath: string) {
    const fullPath = folderPath.startsWith('/') ? folderPath : `${WORK_DIR}/${folderPath}`;
    const currentFiles = this.files.get();
    this.files.set({
      ...currentFiles,
      [fullPath]: { type: 'folder' },
    });
  }

  getFile(filePath: string): File | undefined {
    const fullPath = filePath.startsWith('/') ? filePath : `${WORK_DIR}/${filePath}`;
    const file = this.files.get()[fullPath];
    return file?.type === 'file' ? file : undefined;
  }

  getFileModifications() {
    return undefined;
  }

  resetFileModifications() {}
}
