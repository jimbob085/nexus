import type {
  TicketTracker,
  CreateSuggestionInput,
  CreateTicketInput,
  Suggestion,
} from '../../../src/adapters/interfaces/ticket-tracker.js';
import { apiRequest, apiRequestSafe } from './client.js';

interface PaperclipIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PaperclipIssueList {
  items?: PaperclipIssue[];
}

function mapPriority(priority: number | undefined): string {
  if (priority === undefined) return 'medium';
  if (priority <= 1) return 'critical';
  if (priority <= 3) return 'high';
  if (priority <= 5) return 'medium';
  return 'low';
}

function toSuggestionStatus(paperclipStatus: string): Suggestion['status'] {
  if (paperclipStatus === 'cancelled') return 'dismissed';
  if (paperclipStatus === 'backlog') return 'pending';
  return 'accepted';
}

function suggestionStatusToQuery(status: string | undefined): string {
  if (status === 'pending') return 'backlog';
  if (status === 'accepted') return 'todo,in_progress,in_review';
  if (status === 'dismissed') return 'cancelled';
  return 'backlog,todo,in_progress,in_review,cancelled';
}

/**
 * Maps Nexus TicketTracker interface to the Paperclip Issues API.
 * Suggestions are represented as Paperclip issues with status "backlog".
 * Accepting a suggestion promotes it to "todo"; dismissing cancels it.
 */
export class PaperclipTicketTracker implements TicketTracker {
  private orgId: string;

  constructor(orgId: string) {
    this.orgId = orgId;
  }

  async createSuggestion(
    _orgId: string,
    input: CreateSuggestionInput,
  ): Promise<{ success: boolean; suggestionId?: string; error?: string }> {
    const result = await apiRequestSafe<PaperclipIssue>(
      'POST',
      `/api/companies/${this.orgId}/issues`,
      {
        title: input.title,
        description: input.description,
        status: 'backlog',
        priority: mapPriority(input.priority),
        projectId: input.projectId || undefined,
      },
    );
    if ('error' in result) return { success: false, error: result.error };
    return { success: true, suggestionId: result.data.id };
  }

  async acceptSuggestion(
    _orgId: string,
    _projectId: string,
    suggestionId: string,
  ): Promise<{ success: boolean; ticketId?: string; status?: string; error?: string }> {
    const result = await apiRequestSafe<PaperclipIssue>(
      'PATCH',
      `/api/issues/${suggestionId}`,
      { status: 'todo' },
    );
    if ('error' in result) return { success: false, error: result.error };
    return { success: true, ticketId: result.data.id, status: 'accepted' };
  }

  async dismissSuggestion(
    _orgId: string,
    _projectId: string,
    suggestionId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const result = await apiRequestSafe<PaperclipIssue>(
      'PATCH',
      `/api/issues/${suggestionId}`,
      { status: 'cancelled' },
    );
    if ('error' in result) return { success: false, error: result.error };
    return { success: true };
  }

  async createTicket(
    input: CreateTicketInput,
  ): Promise<{ success: boolean; ticketId?: string; error?: string }> {
    const result = await apiRequestSafe<PaperclipIssue>(
      'POST',
      `/api/companies/${this.orgId}/issues`,
      {
        title: input.title,
        description: input.description,
        status: 'todo',
        priority: mapPriority(input.priority),
        projectId: input.projectId || undefined,
      },
    );
    if ('error' in result) return { success: false, error: result.error };
    return { success: true, ticketId: result.data.id };
  }

  async listSuggestions(
    _orgId: string,
    projectId: string,
    params?: { status?: string; repoKey?: string },
  ): Promise<Suggestion[]> {
    const statusQuery = suggestionStatusToQuery(params?.status);
    try {
      const query = new URLSearchParams({ status: statusQuery, projectId });
      const result = await apiRequest<PaperclipIssue[] | PaperclipIssueList>(
        'GET',
        `/api/companies/${this.orgId}/issues?${query}`,
      );
      const items = Array.isArray(result) ? result : (result.items ?? []);
      return items.map((issue) => ({
        id: issue.id,
        orgId: this.orgId,
        projectId: issue.projectId ?? projectId,
        repoKey: '',
        title: issue.title,
        kind: 'task' as const,
        description: issue.description ?? '',
        affectedFiles: [],
        status: toSuggestionStatus(issue.status),
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
      }));
    } catch {
      return [];
    }
  }
}
