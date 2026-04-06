import type {
  CommunicationAdapter,
  OutboundMessage,
  SendMessageOptions,
} from '../../../src/adapters/interfaces/communication-adapter.js';
import { apiRequestSafe } from './client.js';

/**
 * Routes agent messages to Paperclip issue comments.
 * thread_id or channel_id is treated as the Paperclip issue ID.
 * addReaction and renameThread are no-ops (Paperclip has no equivalent).
 */
export class IssueCommentAdapter implements CommunicationAdapter {
  async sendMessage(
    message: OutboundMessage,
    options: SendMessageOptions,
  ): Promise<{ success: boolean; message_id?: string; thread_id?: string; error?: string }> {
    const issueId = options.thread_id ?? options.channel_id;
    if (!issueId) {
      return { success: false, error: 'No issue ID in thread_id or channel_id' };
    }

    const parts: string[] = [];
    if (message.content) parts.push(message.content);
    if (message.embed_title) parts.push(`**${message.embed_title}**`);
    if (message.embed_description) parts.push(message.embed_description);
    const body = parts.join('\n\n') || '(no content)';

    const result = await apiRequestSafe<{ id: string }>(
      'POST',
      `/api/issues/${issueId}/comments`,
      { body },
    );
    if ('error' in result) return { success: false, error: result.error };
    return { success: true, message_id: result.data.id, thread_id: issueId };
  }

  async addReaction(
    _channelId: string,
    _messageId: string,
    _emoji: string,
    _orgId?: string,
  ): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  async renameThread(
    _threadId: string,
    _newName: string,
    _orgId?: string,
  ): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }
}
