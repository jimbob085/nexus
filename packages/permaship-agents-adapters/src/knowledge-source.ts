import type { KnowledgeSource, KnowledgeDocument } from '../../../src/adapters/interfaces/knowledge-source.js';

/**
 * No-op knowledge source. Knowledge documents are not required for initial Paperclip mode.
 */
export class NullKnowledgeSource implements KnowledgeSource {
  async fetchKnowledgeDocuments(
    _orgId: string,
    _projectId: string,
  ): Promise<KnowledgeDocument[]> {
    return [];
  }
}
