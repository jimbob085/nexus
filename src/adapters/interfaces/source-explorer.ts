/** A source code exploration adapter — reads files, searches code, lists directories. */

export interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
}

export interface CodeSearchMatch {
  filePath: string;
  lineNumber: number;
  lineContent: string;
}

export interface SourceExplorer {
  readFile(orgId: string, repoKey: string, filePath: string): Promise<{ content: string; truncated: boolean } | null>;
  listDirectory(orgId: string, repoKey: string, dirPath: string): Promise<{ entries: DirectoryEntry[] } | null>;
  searchCode(orgId: string, repoKey: string, query: string, options?: { glob?: string; maxResults?: number }): Promise<{ matches: CodeSearchMatch[] } | null>;
  getFileTree(orgId: string, repoKey: string, options?: { maxDepth?: number }): Promise<{ tree: string } | null>;
}
