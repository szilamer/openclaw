import { Injectable, BadRequestException, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import { createReadStream, type ReadStream } from 'fs';
import * as path from 'path';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  extension?: string;
  children?: FileNode[];
}

export interface FileRoot {
  name: string;
  basePath: string;
  children: FileNode[];
}

const IGNORED = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.cache',
  '.prisma', '.npm', '.yarn', '__pycache__',
  'runs', 'logs', 'sessions', 'chrome-profile', 'browser-profile',
  'browser-home', 'browser', 'sandbox-images', '.DS_Store',
  'tmp', 'temp', '.Trash', 'vector', 'embeddings',
  'telegram', 'delivery-queue', 'devices', 'himalaya',
  'identity', 'media', 'sandbox', 'sandboxes', 'subagents',
  'canvas', 'skills', 'cron',
]);

const TEXT_EXTENSIONS = new Set([
  '.md', '.json', '.yml', '.yaml', '.ts', '.tsx', '.js', '.jsx',
  '.sh', '.bash', '.zsh', '.env', '.txt', '.prisma', '.sql',
  '.css', '.html', '.xml', '.toml', '.ini', '.cfg', '.conf',
  '.py', '.rb', '.go', '.rs', '.java', '.c', '.h', '.cpp',
  '.dockerfile', '.gitignore', '.dockerignore', '.editorconfig',
]);

@Injectable()
export class FilesService implements OnModuleInit {
  private readonly logger = new Logger(FilesService.name);
  private readonly roots: { name: string; hostPath: string }[];

  constructor() {
    const rootsEnv = process.env.KB_ROOTS;
    if (rootsEnv) {
      this.roots = rootsEnv.split(',').map((entry) => {
        const [hostPath, name] = entry.split(':');
        return { name: name || path.basename(hostPath), hostPath: hostPath.trim() };
      });
    } else {
      this.roots = [
        { name: 'OpenClaw', hostPath: '/data/openclaw' },
      ];
    }
  }

  async onModuleInit() {
    this.getTree()
      .then(() => this.logger.log('File tree cache warmed'))
      .catch(() => this.logger.warn('File tree cache warm failed'));
  }

  private isTextFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const base = path.basename(filePath).toLowerCase();
    if (TEXT_EXTENSIONS.has(ext)) return true;
    if (['makefile', 'dockerfile', 'vagrantfile', 'gemfile', 'rakefile'].includes(base)) return true;
    if (base.startsWith('.') && !ext) return true;
    return false;
  }

  private validatePath(filePath: string): { root: typeof this.roots[0]; resolved: string } {
    const normalized = path.normalize(filePath);
    for (const root of this.roots) {
      const resolved = path.resolve(root.hostPath, normalized);
      if (resolved.startsWith(path.resolve(root.hostPath))) {
        return { root, resolved };
      }
    }
    throw new BadRequestException('Path is outside allowed directories');
  }

  private treeCache: { data: FileRoot[]; ts: number } | null = null;
  private treeBuildInProgress: Promise<FileRoot[]> | null = null;
  private readonly TREE_CACHE_TTL = 300_000;

  private async buildTree(dirPath: string, relativeTo: string, depth = 0): Promise<FileNode[]> {
    if (depth > 4) return [];

    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return [];
    }

    const nodes: FileNode[] = [];

    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      if (IGNORED.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.openclaw' && entry.name !== '.pi' && entry.name !== '.env') continue;

      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(relativeTo, fullPath);

      if (entry.isDirectory()) {
        const children = await this.buildTree(fullPath, relativeTo, depth + 1);
        if (children.length > 0) {
          nodes.push({ name: entry.name, path: relPath, type: 'directory', children });
        }
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(fullPath);
          if (stat.size > 5 * 1024 * 1024) continue;
          const ext = path.extname(entry.name).toLowerCase();
          if (this.isTextFile(entry.name) || stat.size < 100 * 1024) {
            nodes.push({
              name: entry.name,
              path: relPath,
              type: 'file',
              size: stat.size,
              extension: ext || undefined,
            });
          }
        } catch {
          // skip unreadable files
        }
      }
    }

    return nodes;
  }

  async getTree(): Promise<FileRoot[]> {
    if (this.treeCache && Date.now() - this.treeCache.ts < this.TREE_CACHE_TTL) {
      return this.treeCache.data;
    }

    if (this.treeBuildInProgress) {
      return this.treeBuildInProgress;
    }

    this.treeBuildInProgress = this.buildFullTree();
    try {
      const results = await this.treeBuildInProgress;
      this.treeCache = { data: results, ts: Date.now() };
      return results;
    } finally {
      this.treeBuildInProgress = null;
    }
  }

  private async buildFullTree(): Promise<FileRoot[]> {
    const results: FileRoot[] = [];
    for (const root of this.roots) {
      try {
        await fs.access(root.hostPath);
        const children = await this.buildTree(root.hostPath, root.hostPath);
        results.push({ name: root.name, basePath: root.name, children });
      } catch {
        results.push({ name: root.name, basePath: root.name, children: [] });
      }
    }
    return results;
  }

  private async resolveWithWorkspaceFallback(
    hostPath: string,
    filePath: string,
  ): Promise<string | null> {
    const normalized = path.normalize(filePath);
    const resolved = path.resolve(hostPath, normalized);
    if (!resolved.startsWith(path.resolve(hostPath))) return null;

    try {
      await fs.access(resolved);
      return resolved;
    } catch {
      // noop
    }

    const parts = normalized.split(path.sep);
    if (parts[0] !== 'workspace') return null;

    const rest = parts.slice(1).join(path.sep);
    try {
      const entries = await fs.readdir(hostPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith('workspace-')) continue;
        const candidate = path.resolve(hostPath, entry.name, rest);
        if (!candidate.startsWith(path.resolve(hostPath))) continue;
        try {
          await fs.access(candidate);
          return candidate;
        } catch {
          // noop
        }
      }
    } catch {
      // noop
    }

    return null;
  }

  async getContent(rootName: string, filePath: string): Promise<{ content: string; size: number; editable: boolean }> {
    const root = this.roots.find((r) => r.name === rootName);
    if (!root) throw new NotFoundException('Root not found');

    const resolved = await this.resolveWithWorkspaceFallback(root.hostPath, filePath);
    if (!resolved) throw new NotFoundException('File not found');

    try {
      const stat = await fs.stat(resolved);
      if (!stat.isFile()) throw new BadRequestException('Not a file');
      if (stat.size > 2 * 1024 * 1024) throw new BadRequestException('File too large');

      const content = await fs.readFile(resolved, 'utf-8');
      return { content, size: stat.size, editable: this.isTextFile(resolved) };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new NotFoundException('File not found');
    }
  }

  private guessMime(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const MAP: Record<string, string> = {
      '.md': 'text/markdown; charset=utf-8',
      '.txt': 'text/plain; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.ts': 'text/typescript; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.csv': 'text/csv; charset=utf-8',
      '.xml': 'application/xml; charset=utf-8',
      '.yaml': 'text/yaml; charset=utf-8',
      '.yml': 'text/yaml; charset=utf-8',
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.wav': 'audio/wav',
      '.zip': 'application/zip',
    };
    return MAP[ext] || 'application/octet-stream';
  }

  async resolveRawFile(
    rootName: string,
    filePath: string,
  ): Promise<{
    stream: ReadStream;
    mime: string;
    size: number;
    filename: string;
  } | null> {
    const root = this.roots.find((r) => r.name === rootName);
    if (!root) return null;

    const resolved = await this.resolveWithWorkspaceFallback(root.hostPath, filePath);
    if (!resolved) return null;

    try {
      const stat = await fs.stat(resolved);
      if (!stat.isFile()) return null;
      if (stat.size > 50 * 1024 * 1024) return null;
      return {
        stream: createReadStream(resolved),
        mime: this.guessMime(resolved),
        size: stat.size,
        filename: path.basename(resolved),
      };
    } catch {
      return null;
    }
  }

  async saveContent(rootName: string, filePath: string, content: string): Promise<{ success: boolean; size: number }> {
    const root = this.roots.find((r) => r.name === rootName);
    if (!root) throw new NotFoundException('Root not found');

    const resolved = await this.resolveWithWorkspaceFallback(root.hostPath, filePath);
    if (!resolved) throw new NotFoundException('File not found');

    try {
      const stat = await fs.stat(resolved);
      if (!stat.isFile()) throw new NotFoundException('Not a file');
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new NotFoundException('File not found');
    }

    await fs.writeFile(resolved, content, 'utf-8');
    const stat = await fs.stat(resolved);
    return { success: true, size: stat.size };
  }
}
