import type { CommitProvider } from '../../../src/adapters/interfaces/commit-provider.js';

/**
 * No-op commit provider. Paperclip manages execution context;
 * commit tracking is not required for local mode.
 */
export class NullCommitProvider implements CommitProvider {
  async fetchLatestCommit(
    _orgId: string,
    _repoKey: string,
  ): Promise<{ sha: string; date: string } | null> {
    return null;
  }

  async fetchCommitsSince(
    _orgId: string,
    _repoKey: string,
    _since: string,
  ): Promise<Array<{ sha: string; files: string[] }> | null> {
    return null;
  }
}
