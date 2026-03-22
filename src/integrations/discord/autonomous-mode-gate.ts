import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  Message,
} from 'discord.js';
import { getLinkedAccount } from '../../auth/account_linker.js';
import { Role } from '../../rbac/types.js';
import { logGuardrailEvent } from '../../telemetry/index.js';
import { logger } from '../../logger.js';

/** 5-minute HITL approval window — fail-closed on expiry. */
export const ADMIN_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

const ADMIN_ROLES: Role[] = ['ADMIN', 'OWNER'];

export interface AdminApprovalResult {
  approved: boolean;
  /** Discord user ID of the approver/denier (absent on timeout). */
  approverId?: string;
  timedOut: boolean;
}

/**
 * Sends a Discord message with Approve/Deny buttons and awaits a response
 * from a user with Admin or Owner role. Times out after 5 minutes (fail-closed).
 *
 * Used as a Discord-native Human-in-the-Loop gate when the Conductor UI is
 * unavailable (e.g., in the open-source standalone deployment).
 */
export async function requestAdminApproval(
  message: Message,
  actionDescription: string,
  settingKey: string,
): Promise<AdminApprovalResult> {
  const approveRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('hitl_approve')
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('hitl_deny')
      .setLabel('Deny')
      .setStyle(ButtonStyle.Danger),
  );

  const gateMsg = await message.reply({
    content: [
      `⚠️ **Admin Approval Required**`,
      `**Action:** ${actionDescription}`,
      `**Setting:** \`${settingKey}\``,
      `Only users with **Admin** or **Owner** roles can approve this action.`,
      `This request expires in **5 minutes** and will fail-closed on timeout.`,
    ].join('\n'),
    components: [approveRow],
  });

  logGuardrailEvent({
    event: 'autonomous_mode_gate_shown',
    channelId: message.channelId,
    userId: message.author.id,
    settingKey,
  });

  try {
    const interaction = await gateMsg.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: ADMIN_APPROVAL_TIMEOUT_MS,
      filter: (i) => {
        const account = getLinkedAccount('discord', i.user.id);
        const hasAdminRole = account !== null && ADMIN_ROLES.includes(account.role);
        if (!hasAdminRole) {
          // Inform the non-admin user without blocking the collector
          i.reply({
            content: 'Only Admin or Owner roles can approve this action.',
            ephemeral: true,
          }).catch(() => {});
        }
        return hasAdminRole;
      },
    });

    const approved = interaction.customId === 'hitl_approve';
    const approverId = interaction.user.id;

    logGuardrailEvent(
      approved
        ? { event: 'autonomous_mode_gate_approved', channelId: message.channelId, userId: message.author.id, approverId, settingKey }
        : { event: 'autonomous_mode_gate_denied', channelId: message.channelId, userId: message.author.id, approverId, settingKey },
    );

    logger.info(
      {
        event: 'autonomous_mode_gate_resolved',
        approved,
        approverId,
        settingKey,
        channelId: message.channelId,
        requestingUserId: message.author.id,
      },
      approved ? 'Autonomous mode action approved' : 'Autonomous mode action denied',
    );

    await interaction.update({
      content: approved
        ? `✅ Action **approved** by <@${approverId}>.`
        : `❌ Action **denied** by <@${approverId}>.`,
      components: [],
    });

    return { approved, approverId, timedOut: false };
  } catch {
    // Timeout — fail closed
    await gateMsg
      .edit({
        content: '⏱️ Approval request timed out after 5 minutes. Action **not executed** (fail-closed).',
        components: [],
      })
      .catch(() => {});

    logGuardrailEvent({
      event: 'autonomous_mode_gate_expired',
      channelId: message.channelId,
      userId: message.author.id,
      settingKey,
    });

    logger.warn(
      {
        event: 'autonomous_mode_gate_timeout',
        settingKey,
        channelId: message.channelId,
        requestingUserId: message.author.id,
      },
      'Autonomous mode approval timed out — fail closed',
    );

    return { approved: false, timedOut: true };
  }
}
