/** A workspace provider — clones repos to temporary local directories for deep research. */

export interface WorkspaceHandle {
  repoPath: string;
  repoKey: string;
  cleanup: () => Promise<void>;
}

export interface WorkspaceProvider {
  acquireWorkspace(orgId: string, repoKey: string): Promise<WorkspaceHandle>;
}
