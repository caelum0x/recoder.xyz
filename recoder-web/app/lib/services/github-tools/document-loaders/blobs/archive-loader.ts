import { createHash } from "node:crypto";
import { type Dirent, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import type { Octokit } from "@octokit/core";
import {
  type Document,
  type DocumentLoader,
  replaceNullCharacters,
} from "../types";
import { executeRestRequest } from "../utils";
import type {
  GitHubBlobMetadata,
  GitHubArchiveLoaderParams,
  GitHubArchiveLoaderOptions,
} from "./types";

/**
 * Create a document loader that downloads and extracts a repository archive
 * This is more efficient for large repositories than using the Trees API
 *
 * Note: This loader requires the `tar` package to be installed
 */
export function createGitHubArchiveLoader(
  octokit: Octokit,
  params: GitHubArchiveLoaderParams,
  options: GitHubArchiveLoaderOptions = {}
): DocumentLoader<GitHubBlobMetadata> {
  const { maxBlobSize = 1024 * 1024 } = options; // 1MB default
  const { owner, repo, commitSha } = params;
  const uniqueId = Math.random().toString(36).substring(2, 15);
  const archivePath = join(
    tmpdir(),
    `${owner}-${repo}-${commitSha}-${uniqueId}.tar.gz`
  );
  const extractDir = join(
    tmpdir(),
    `${owner}-${repo}-${commitSha}-${uniqueId}`
  );
  let prepared: Promise<string> | null = null;

  async function prepare(): Promise<string> {
    if (!prepared) {
      prepared = (async () => {
        await fs.mkdir(extractDir, { recursive: true });
        const { data } = await executeRestRequest(
          () =>
            octokit.request("GET /repos/{owner}/{repo}/tarball/{ref}", {
              owner,
              repo,
              ref: commitSha,
              request: { redirect: "follow" },
            }),
          "Repository Tarball",
          `${owner}/${repo}/tarball/${commitSha}`
        );

        const buffer = Buffer.isBuffer(data)
          ? data
          : data instanceof ArrayBuffer
            ? Buffer.from(data)
            : Buffer.from(data as string, "binary");
        await fs.writeFile(archivePath, buffer);

        // Extract using tar command (cross-platform)
        // Note: In a real implementation, you would use the `tar` npm package
        // For now, we'll use a simple approach that works on Unix-like systems
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execAsync = promisify(exec);

        try {
          await execAsync(`tar -xzf "${archivePath}" -C "${extractDir}" --strip-components=1`);
        } catch (error) {
          // Fallback: try without --strip-components for Windows compatibility
          await execAsync(`tar -xzf "${archivePath}" -C "${extractDir}"`);
        }

        return extractDir;
      })();
    }
    return prepared;
  }

  async function* walk(dir: string): AsyncGenerator<string> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      console.warn(`Failed to read directory ${dir}:`, error);
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        yield* walk(full);
      } else if (entry.isFile() && !entry.isSymbolicLink()) {
        yield full;
      }
    }
  }

  function computeSha(content: Buffer): string {
    const header = Buffer.from(`blob ${content.length}\0`);
    return createHash("sha1")
      .update(Buffer.concat([header, content]))
      .digest("hex");
  }

  function isValidPath(path: string): boolean {
    // Prevent path traversal attacks
    const segments = path.split(/[/\\]/);
    const hasTraversal = segments.some((segment) => segment === "..");
    return !hasTraversal && !path.startsWith("/") && !path.includes("\0");
  }

  const loadMetadata = async function* (): AsyncIterable<GitHubBlobMetadata> {
    const root = await prepare();
    for await (const file of walk(root)) {
      const stat = await fs.stat(file);
      if (stat.size > maxBlobSize) {
        console.warn(
          `Blob size is too large: ${stat.size} bytes, skipping: ${file}`
        );
        continue;
      }
      const content = await fs.readFile(file);
      const fileSha = computeSha(content);
      const relative = file.slice(root.length + 1);
      if (!isValidPath(relative)) {
        console.warn(`Skipping potentially unsafe path: ${relative}`);
        continue;
      }
      yield { owner, repo, fileSha, path: relative };
    }
  };

  const loadDocument = async (
    metadata: GitHubBlobMetadata
  ): Promise<Document<GitHubBlobMetadata> | null> => {
    const root = await prepare();
    const fullPath = normalize(join(root, metadata.path));

    // Prevent path traversal attacks
    if (!fullPath.startsWith(normalize(root))) {
      console.warn(`Path traversal attempt detected: ${metadata.path}`);
      return null;
    }

    let contentBytes: Buffer;
    try {
      contentBytes = await fs.readFile(fullPath);
    } catch {
      return null;
    }
    if (contentBytes.length > maxBlobSize) {
      console.warn(
        `Blob size is too large: ${contentBytes.length} bytes, skipping: ${metadata.path}`
      );
      return null;
    }
    const textDecoder = new TextDecoder("utf-8", { fatal: true });
    try {
      const decodedContent = textDecoder.decode(contentBytes);
      return {
        content: replaceNullCharacters(decodedContent),
        metadata,
      };
    } catch {
      return null;
    }
  };

  return { loadMetadata, loadDocument };
}
