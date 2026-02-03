import { vi } from 'vitest';
import * as realFs from 'node:fs/promises';

const mockReadFile = vi.fn(realFs.readFile);
const mockStat = vi.fn(realFs.stat);
const mockAccess = vi.fn(realFs.access);
const mockReaddir = vi.fn(realFs.readdir);
const mockLstat = vi.fn(realFs.lstat);
const mockRealpath = vi.fn(realFs.realpath);
const mockMkdir = vi.fn(realFs.mkdir);
const mockWriteFile = vi.fn(realFs.writeFile);
const mockUnlink = vi.fn(realFs.unlink);

const fsPromises = {
  readFile: mockReadFile,
  stat: mockStat,
  access: mockAccess,
  readdir: mockReaddir,
  lstat: mockLstat,
  realpath: mockRealpath,
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
  unlink: mockUnlink,
};

export const mockControl = {
  mockReadFile,
  mockStat,
  mockAccess,
  mockReaddir,
  mockLstat,
  mockRealpath,
  mockMkdir,
  mockWriteFile,
  mockUnlink,
  fsPromises,
};

export default fsPromises;
