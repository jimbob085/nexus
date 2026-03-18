import { initAdapters, type AdapterSet } from './registry.js';
import { logger } from '../logger.js';
import { config } from '../config.js';

/**
 * Loads and initializes the adapter set based on ADAPTER_PROFILE env var.
 *
 * - "permaship" — PermaShip production adapters (requires PERMASHIP_* env vars)
 * - "default" (or unset) — Standalone OSS adapters (local DB, console output, file-based config)
 */
export async function loadAdapters(): Promise<void> {
  const profile = process.env.ADAPTER_PROFILE ?? 'default';

  let adapters: AdapterSet;

  if (profile === 'permaship') {
    adapters = await loadPermashipAdapters();
    logger.info('Loaded PermaShip adapter profile');
  } else {
    adapters = await loadDefaultAdapters();
    logger.info('Loaded default (OSS) adapter profile');
  }

  initAdapters(adapters);
}

async function loadPermashipAdapters(): Promise<AdapterSet> {
  // PermaShip adapters live in the external @permaship/agents-adapters package.
  // Dynamic import keeps the OSS core free of PermaShip dependencies.
  try {
    const pkgName = '@permaship/agents-adapters';
    const mod = await import(/* webpackIgnore: true */ pkgName) as { loadPermashipAdapters: () => AdapterSet };
    return mod.loadPermashipAdapters();
  } catch (err) {
    logger.error({ err }, 'Failed to load @permaship/agents-adapters — is it installed?');
    throw new Error(
      'ADAPTER_PROFILE=permaship requires @permaship/agents-adapters to be installed. ' +
      'Run: npm install @permaship/agents-adapters',
    );
  }
}

async function loadDefaultAdapters(): Promise<AdapterSet> {
  const { DefaultLLMProvider } = await import('./default/llm-provider.js');
  const { ConsoleCommunicationAdapter } = await import('./default/communication-adapter.js');
  const { LocalProjectRegistry } = await import('./default/project-registry.js');
  const { LocalTicketTracker } = await import('./default/ticket-tracker.js');
  const { GitCommitProvider } = await import('./default/commit-provider.js');
  const { FileKnowledgeSource } = await import('./default/knowledge-source.js');
  const { SingleTenantResolver } = await import('./default/tenant-resolver.js');
  const { ConsoleUsageSink } = await import('./default/usage-sink.js');

  return {
    usageSink: new ConsoleUsageSink(),
    commitProvider: new GitCommitProvider(),
    knowledgeSource: new FileKnowledgeSource(),
    communicationAdapter: new ConsoleCommunicationAdapter(),
    projectRegistry: new LocalProjectRegistry(),
    ticketTracker: new LocalTicketTracker(),
    tenantResolver: new SingleTenantResolver(
      config.DEFAULT_ORG_ID ?? '00000000-0000-0000-0000-000000000000',
      config.DEFAULT_ORG_NAME ?? 'Default Organization',
    ),
    llmProvider: new DefaultLLMProvider(config.LLM_API_KEY ?? ''),
  };
}
