import type {
  WorkspaceProvider,
  WorkspaceHandle,
} from '../../../src/adapters/interfaces/workspace-provider.js';
import { apiRequest } from './client.js';

interface PaperclipProject {
  id: string;
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
 * Returns the managedFolder path from the Paperclip project workspace config.
 * cleanup() is a no-op — the managed folder is owned by Paperclip.
 */
export class ManagedWorkspaceProvider implements WorkspaceProvider {
  private orgId: string;

  constructor(orgId: string) {
    this.orgId = orgId;
  }

  async acquireWorkspace(orgId: string, repoKey: string): Promise<WorkspaceHandle> {
    const effectiveOrgId = orgId || this.orgId;
    const result = await apiRequest<PaperclipProject[] | { items?: PaperclipProject[] }>(
      'GET',
      `/api/companies/${effectiveOrgId}/projects`,
    );
    const projects = Array.isArray(result) ? result : (result.items ?? []);

    for (const project of projects) {
      const repoUrl =
        project.codebase?.repoUrl ??
        project.primaryWorkspace?.repoUrl ??
        project.workspaces?.[0]?.repoUrl;
      if (extractRepoKey(repoUrl) === repoKey) {
        const managedFolder = project.codebase?.managedFolder;
        if (managedFolder) {
          return {
            repoPath: managedFolder,
            repoKey,
            cleanup: async () => {},
          };
        }
      }
    }

    throw new Error(`No managed workspace found for repoKey: ${repoKey}`);
  }
}
