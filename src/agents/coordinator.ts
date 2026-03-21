import { executeAgent } from './executor.js';
import { getAgent } from './registry.js';
import { logger } from '../logger.js';
import { logAgentReviewTimeout } from '../telemetry/cross-agent.js';
import type { AgentId } from './types.js';

/** Timeout for a cross-agent review: 5 minutes. */
const REVIEW_TIMEOUT_MS = 5 * 60 * 1000;

export interface ReviewRequest {
  orgId: string;
  proposingAgentId: AgentId;
  reviewerAgentId: AgentId;
  proposal: string;
  channelId: string;
  /** Optional proposal ID for telemetry and circuit-breaker correlation. */
  proposalId?: string;
}

export interface ReviewResult {
  feedback: string;
  /** True when the reviewer agent did not respond within the timeout window. */
  timedOut: boolean;
}

export async function coordinateReview(request: ReviewRequest): Promise<ReviewResult> {
  const reviewer = getAgent(request.reviewerAgentId);
  const proposer = getAgent(request.proposingAgentId);

  logger.info(
    { proposer: request.proposingAgentId, reviewer: request.reviewerAgentId, orgId: request.orgId },
    'Coordinating cross-agent review'
  );

  const reviewPrompt = `
You are the ${reviewer?.title}. Your colleague, the ${proposer?.title}, has proposed the following:

"${request.proposal}"

Please review this proposal from your perspective as ${reviewer?.title}.
- Is it feasible?
- Are there risks or side effects they missed?
- Do you have improvements?

Provide a concise critique or "Looks good to me". If you have changes, be specific.
`.trim();

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('review_timeout')), REVIEW_TIMEOUT_MS),
  );

  try {
    const reviewResponse = await Promise.race([
      executeAgent({
        orgId: request.orgId,
        agentId: request.reviewerAgentId,
        channelId: request.channelId,
        userId: 'system',
        userName: `System (Review Coordinator)`,
        userMessage: reviewPrompt,
      }),
      timeoutPromise,
    ]);

    return { feedback: reviewResponse || 'No review feedback provided.', timedOut: false };
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.message === 'review_timeout';
    if (isTimeout) {
      logAgentReviewTimeout({
        orgId: request.orgId,
        proposingAgentId: request.proposingAgentId,
        reviewerAgentId: request.reviewerAgentId,
        timeoutMs: REVIEW_TIMEOUT_MS,
        proposalId: request.proposalId,
      });
      return { feedback: 'Review skipped: secondary agent did not respond within the timeout window.', timedOut: true };
    }
    throw err;
  }
}

/**
 * Decides if a proposal needs a review and from whom.
 */
export function getRequiredReviewer(agentId: AgentId, proposal: string): AgentId | null {
  // Simple rules for now:
  // CISO proposals should be reviewed by SRE
  if (agentId === 'ciso') return 'sre';

  // UX proposals should be reviewed by QA
  if (agentId === 'ux-designer') return 'qa-manager';

  // SRE proposals touching security should be reviewed by CISO
  if (agentId === 'sre' && (proposal.toLowerCase().includes('security') || proposal.toLowerCase().includes('auth'))) {
    return 'ciso';
  }

  // FinOps should be reviewed by Product Manager for business alignment
  if (agentId === 'finops') return 'product-manager';

  // Release Engineering should be reviewed by SRE for infrastructure stability
  if (agentId === 'release-engineering') return 'sre';

  // AgentOps should be reviewed by SRE
  if (agentId === 'agentops') return 'sre';

  // VOC (Voice of Customer) should be reviewed by Product Manager
  if (agentId === 'voc') return 'product-manager';

  // High-impact proposals from any agent should be reviewed by CTO
  const highImpactSignals = ['critical', 'breaking change', 'multi-tenant', 'irreversible', 'high risk'];
  const lowerProposal = proposal.toLowerCase();
  if (highImpactSignals.some((signal) => lowerProposal.includes(signal))) {
    return 'nexus';
  }

  return null;
}
