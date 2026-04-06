import type { AdapterSet } from '../../../src/adapters/registry.js';
import { PaperclipTicketTracker } from './ticket-tracker.js';
import { PaperclipProjectRegistry } from './project-registry.js';
import { StaticTenantResolver } from './tenant-resolver.js';
import { IssueCommentAdapter } from './communication-adapter.js';
import { NullCommitProvider } from './commit-provider.js';
import { NullKnowledgeSource } from './knowledge-source.js';
import { LogUsageSink } from './usage-sink.js';
import { createLLMProvider } from './llm-provider.js';
import { createSourceExplorer } from './source-explorer.js';
import { ManagedWorkspaceProvider } from './workspace-provider.js';

export function loadPermashipAdapters(): AdapterSet {
  const orgId = process.env.PERMASHIP_ORG_ID ?? '';

  return {
    usageSink: new LogUsageSink(),
    commitProvider: new NullCommitProvider(),
    knowledgeSource: new NullKnowledgeSource(),
    communicationAdapter: new IssueCommentAdapter(),
    projectRegistry: new PaperclipProjectRegistry(orgId),
    ticketTracker: new PaperclipTicketTracker(orgId),
    tenantResolver: new StaticTenantResolver(orgId),
    llmProvider: createLLMProvider(),
    sourceExplorer: createSourceExplorer(orgId),
    workspaceProvider: new ManagedWorkspaceProvider(orgId),
  };
}
