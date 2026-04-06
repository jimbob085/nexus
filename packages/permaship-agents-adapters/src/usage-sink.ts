import type { UsageSink, UsagePayload } from '../../../src/adapters/interfaces/usage-sink.js';

/**
 * Logs usage metrics to stdout. No budget reporting needed for local Paperclip mode.
 */
export class LogUsageSink implements UsageSink {
  async reportUsage(orgId: string, payload: UsagePayload): Promise<void> {
    console.log('[usage]', {
      orgId,
      inputTokens: payload.inputTokens,
      outputTokens: payload.outputTokens,
      turns: payload.turns,
    });
  }
}
