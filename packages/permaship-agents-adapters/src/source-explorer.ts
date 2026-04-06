import type { SourceExplorer } from '../../../src/adapters/interfaces/source-explorer.js';
import { LocalSourceExplorer } from '../../../src/adapters/default/source-explorer.js';
import { apiRequest } from './client.js';

interface PaperclipProject {
  id: string;
  urlKey: string;
  codebase?: { repoUrl?: string | null; managedFolder?: string | null } | null;
  primaryWorkspace?: { repoUrl?: string | null } | null;
  workspaces?: Array<{ repoUrl?: string | null }>;
}

function extractRepoKey(repoUrl: string | null | undefined): string | null {
  if (!repoUrl) return null;
  try {
    return new URL(repoUrl).pathname.replace(/^\//, '').replace(/\.git$/, '') || null;
  } catch {
    return null;
  }
}

/**
 * LocalSourceExplorer wired to Paperclip project workspaces.
 * Resolves repoKey → managedFolder via the Paperclip projects API.
 */
export function createSourceExplorer(orgId: string): SourceExplorer {
  const resolveRoot = async (repoKey: string): Promise<string | null> => {
    try {
      const result = await apiRequest<PaperclipProject[] | { items?: PaperclipProject[] }>(
        'GET',
        `/api/companies/${orgId}/projects`,
      );
      const projects = Array.isArray(result) ? result : (result.items ?? []);
      for (const project of projects) {
        const repoUrl =
          project.codebase?.repoUrl ??
          project.primaryWorkspace?.repoUrl ??
          project.workspaces?.[0]?.repoUrl;
        if (extractRepoKey(repoUrl) === repoKey) {
          return project.codebase?.managedFolder ?? null;
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  return new LocalSourceExplorer(resolveRoot);
}
