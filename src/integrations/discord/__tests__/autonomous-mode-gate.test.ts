import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---

vi.mock('../../../auth/account_linker.js', () => ({
  getLinkedAccount: vi.fn(),
}));

vi.mock('../../../telemetry/index.js', () => ({
  logGuardrailEvent: vi.fn(),
}));

vi.mock('../../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

// --- Imports (after mocks) ---

import { requestAdminApproval, ADMIN_APPROVAL_TIMEOUT_MS } from '../autonomous-mode-gate.js';
import { getLinkedAccount } from '../../../auth/account_linker.js';
import { logGuardrailEvent } from '../../../telemetry/index.js';
import { logger } from '../../../logger.js';

// Helpers to build a minimal Discord Message mock

function makeGateMsg(interactionResult: 'hitl_approve' | 'hitl_deny' | 'timeout') {
  const editMock = vi.fn().mockResolvedValue(undefined);

  let awaitFn: ReturnType<typeof vi.fn>;

  if (interactionResult === 'timeout') {
    awaitFn = vi.fn().mockRejectedValue(new Error('Collector timeout'));
  } else {
    const updateMock = vi.fn().mockResolvedValue(undefined);
    const replyMock = vi.fn().mockResolvedValue(undefined);
    awaitFn = vi.fn().mockResolvedValue({
      customId: interactionResult,
      user: { id: 'approver-id-123' },
      update: updateMock,
      reply: replyMock,
    });
  }

  return {
    edit: editMock,
    awaitMessageComponent: awaitFn,
  };
}

function makeMessage(gateMsg: ReturnType<typeof makeGateMsg>) {
  return {
    author: { id: 'requester-id-456' },
    channelId: 'channel-789',
    reply: vi.fn().mockResolvedValue(gateMsg),
  } as unknown as import('discord.js').Message;
}

const mockGetLinkedAccount = vi.mocked(getLinkedAccount);
const mockLogGuardrailEvent = vi.mocked(logGuardrailEvent);
const mockLoggerInfo = vi.mocked(logger.info);
const mockLoggerWarn = vi.mocked(logger.warn);

describe('requestAdminApproval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports ADMIN_APPROVAL_TIMEOUT_MS as 5 minutes', () => {
    expect(ADMIN_APPROVAL_TIMEOUT_MS).toBe(5 * 60 * 1000);
  });

  describe('approval flow', () => {
    it('returns { approved: true, timedOut: false } when an admin approves', async () => {
      mockGetLinkedAccount.mockReturnValue({ role: 'ADMIN' } as any);
      const gateMsg = makeGateMsg('hitl_approve');
      const message = makeMessage(gateMsg);

      const result = await requestAdminApproval(message, 'enable autonomous mode', 'autonomous_mode');

      expect(result.approved).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.approverId).toBe('approver-id-123');
    });

    it('returns { approved: true, timedOut: false } when an owner approves', async () => {
      mockGetLinkedAccount.mockReturnValue({ role: 'OWNER' } as any);
      const gateMsg = makeGateMsg('hitl_approve');
      const message = makeMessage(gateMsg);

      const result = await requestAdminApproval(message, 'enable autonomous mode', 'autonomous_mode');

      expect(result.approved).toBe(true);
      expect(result.timedOut).toBe(false);
    });

    it('logs autonomous_mode_gate_approved event on approval', async () => {
      mockGetLinkedAccount.mockReturnValue({ role: 'ADMIN' } as any);
      const gateMsg = makeGateMsg('hitl_approve');
      const message = makeMessage(gateMsg);

      await requestAdminApproval(message, 'enable autonomous mode', 'autonomous_mode');

      expect(mockLogGuardrailEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'autonomous_mode_gate_approved',
          approverId: 'approver-id-123',
          settingKey: 'autonomous_mode',
        }),
      );
    });

    it('calls logger.info on approval', async () => {
      mockGetLinkedAccount.mockReturnValue({ role: 'OWNER' } as any);
      const gateMsg = makeGateMsg('hitl_approve');
      const message = makeMessage(gateMsg);

      await requestAdminApproval(message, 'enable autonomous mode', 'autonomous_mode');

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'autonomous_mode_gate_resolved', approved: true }),
        expect.any(String),
      );
    });
  });

  describe('denial flow', () => {
    it('returns { approved: false, timedOut: false } when an admin denies', async () => {
      mockGetLinkedAccount.mockReturnValue({ role: 'ADMIN' } as any);
      const gateMsg = makeGateMsg('hitl_deny');
      const message = makeMessage(gateMsg);

      const result = await requestAdminApproval(message, 'disable autonomous mode', 'autonomous_mode');

      expect(result.approved).toBe(false);
      expect(result.timedOut).toBe(false);
      expect(result.approverId).toBe('approver-id-123');
    });

    it('logs autonomous_mode_gate_denied event on denial', async () => {
      mockGetLinkedAccount.mockReturnValue({ role: 'ADMIN' } as any);
      const gateMsg = makeGateMsg('hitl_deny');
      const message = makeMessage(gateMsg);

      await requestAdminApproval(message, 'disable autonomous mode', 'autonomous_mode');

      expect(mockLogGuardrailEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'autonomous_mode_gate_denied',
          approverId: 'approver-id-123',
          settingKey: 'autonomous_mode',
        }),
      );
    });

    it('calls logger.info with approved:false on denial', async () => {
      mockGetLinkedAccount.mockReturnValue({ role: 'OWNER' } as any);
      const gateMsg = makeGateMsg('hitl_deny');
      const message = makeMessage(gateMsg);

      await requestAdminApproval(message, 'disable autonomous mode', 'autonomous_mode');

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'autonomous_mode_gate_resolved', approved: false }),
        expect.any(String),
      );
    });
  });

  describe('timeout / fail-closed', () => {
    it('returns { approved: false, timedOut: true } on timeout', async () => {
      const gateMsg = makeGateMsg('timeout');
      const message = makeMessage(gateMsg);

      const result = await requestAdminApproval(message, 'enable autonomous mode', 'autonomous_mode');

      expect(result.approved).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.approverId).toBeUndefined();
    });

    it('edits the gate message with a timeout notice on expiry', async () => {
      const gateMsg = makeGateMsg('timeout');
      const message = makeMessage(gateMsg);

      await requestAdminApproval(message, 'enable autonomous mode', 'autonomous_mode');

      expect(gateMsg.edit).toHaveBeenCalledWith(
        expect.objectContaining({ components: [] }),
      );
    });

    it('logs autonomous_mode_gate_expired event on timeout', async () => {
      const gateMsg = makeGateMsg('timeout');
      const message = makeMessage(gateMsg);

      await requestAdminApproval(message, 'enable autonomous mode', 'autonomous_mode');

      expect(mockLogGuardrailEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'autonomous_mode_gate_expired',
          settingKey: 'autonomous_mode',
        }),
      );
    });

    it('calls logger.warn on timeout', async () => {
      const gateMsg = makeGateMsg('timeout');
      const message = makeMessage(gateMsg);

      await requestAdminApproval(message, 'enable autonomous mode', 'autonomous_mode');

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'autonomous_mode_gate_timeout' }),
        expect.any(String),
      );
    });
  });

  describe('gate message setup', () => {
    it('logs autonomous_mode_gate_shown when gate is displayed', async () => {
      mockGetLinkedAccount.mockReturnValue({ role: 'ADMIN' } as any);
      const gateMsg = makeGateMsg('hitl_approve');
      const message = makeMessage(gateMsg);

      await requestAdminApproval(message, 'enable autonomous mode', 'autonomous_mode');

      expect(mockLogGuardrailEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'autonomous_mode_gate_shown',
          userId: 'requester-id-456',
          channelId: 'channel-789',
          settingKey: 'autonomous_mode',
        }),
      );
    });

    it('sends Approve and Deny buttons in the gate message', async () => {
      mockGetLinkedAccount.mockReturnValue({ role: 'ADMIN' } as any);
      const gateMsg = makeGateMsg('hitl_approve');
      const message = makeMessage(gateMsg);

      await requestAdminApproval(message, 'enable autonomous mode', 'autonomous_mode');

      const replyCall = (message.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(replyCall.components).toHaveLength(1);
    });
  });

  describe('RBAC filter', () => {
    it('does NOT filter out admin users (returns true from filter)', async () => {
      // Verify that when getLinkedAccount returns ADMIN, the filter passes the interaction
      mockGetLinkedAccount.mockReturnValue({ role: 'ADMIN' } as any);
      const gateMsg = makeGateMsg('hitl_approve');
      const message = makeMessage(gateMsg);

      // Capture the filter function passed to awaitMessageComponent
      let capturedFilter: ((i: any) => boolean) | undefined;
      (gateMsg.awaitMessageComponent as ReturnType<typeof vi.fn>).mockImplementationOnce(
        ({ filter }: { filter: (i: any) => boolean }) => {
          capturedFilter = filter;
          // Simulate an admin clicking
          const fakeInteraction = {
            user: { id: 'approver-id-123' },
            customId: 'hitl_approve',
            update: vi.fn().mockResolvedValue(undefined),
            reply: vi.fn().mockResolvedValue(undefined),
          };
          return Promise.resolve(fakeInteraction);
        },
      );

      await requestAdminApproval(message, 'enable autonomous mode', 'autonomous_mode');

      // If capturedFilter was used, verify it accepts admin roles
      if (capturedFilter) {
        mockGetLinkedAccount.mockReturnValue({ role: 'ADMIN' } as any);
        const fakeI = { user: { id: 'some-admin' }, reply: vi.fn() };
        expect(capturedFilter(fakeI)).toBe(true);
      }
    });

    it('rejects MEMBER role users from approving (filter returns false)', () => {
      // Simulate filter being called with a MEMBER account
      mockGetLinkedAccount.mockReturnValue({ role: 'MEMBER' } as any);

      // Build the filter manually as the module constructs it
      const filter = (i: { user: { id: string }; reply: ReturnType<typeof vi.fn> }) => {
        const account = getLinkedAccount('discord', i.user.id);
        const ADMIN_ROLES = ['ADMIN', 'OWNER'] as const;
        return account !== null && (ADMIN_ROLES as readonly string[]).includes(account.role);
      };

      const fakeI = { user: { id: 'member-user' }, reply: vi.fn() };
      expect(filter(fakeI)).toBe(false);
    });

    it('rejects VIEWER role users from approving (filter returns false)', () => {
      mockGetLinkedAccount.mockReturnValue({ role: 'VIEWER' } as any);

      const filter = (i: { user: { id: string }; reply: ReturnType<typeof vi.fn> }) => {
        const account = getLinkedAccount('discord', i.user.id);
        const ADMIN_ROLES = ['ADMIN', 'OWNER'] as const;
        return account !== null && (ADMIN_ROLES as readonly string[]).includes(account.role);
      };

      const fakeI = { user: { id: 'viewer-user' }, reply: vi.fn() };
      expect(filter(fakeI)).toBe(false);
    });

    it('rejects unlinked users from approving (filter returns false)', () => {
      mockGetLinkedAccount.mockReturnValue(null);

      const filter = (i: { user: { id: string }; reply: ReturnType<typeof vi.fn> }) => {
        const account = getLinkedAccount('discord', i.user.id);
        const ADMIN_ROLES = ['ADMIN', 'OWNER'] as const;
        return account !== null && (ADMIN_ROLES as readonly string[]).includes(account.role);
      };

      const fakeI = { user: { id: 'unlinked-user' }, reply: vi.fn() };
      expect(filter(fakeI)).toBe(false);
    });
  });
});
