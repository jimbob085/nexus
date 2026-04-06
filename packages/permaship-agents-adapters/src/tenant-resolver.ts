import type {
  TenantResolver,
  WorkspaceContext,
} from '../../../src/adapters/interfaces/tenant-resolver.js';

/**
 * Static tenant resolver for Paperclip mode.
 * Reads PERMASHIP_ORG_ID from env. Tenancy is managed entirely by Paperclip,
 * so linkWorkspace/activateWorkspace are no-ops.
 */
export class StaticTenantResolver implements TenantResolver {
  private orgId: string;

  constructor(orgId: string) {
    this.orgId = orgId;
  }

  async getContext(
    platform: 'discord' | 'slack' | 'github',
    workspaceId: string,
  ): Promise<WorkspaceContext | null> {
    return {
      orgId: this.orgId,
      orgName: 'PermaShip',
      platform,
      workspaceId,
    };
  }

  async linkWorkspace(
    _orgId: string,
    _platform: 'discord' | 'slack' | 'github',
    _workspaceId: string,
    _activatedBy: string,
    _channelId: string,
    _orgName?: string,
  ): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  async setInternalChannel(
    _platform: 'discord' | 'slack' | 'github',
    _workspaceId: string,
    _channelId: string,
  ): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  async getOrgName(_orgId: string): Promise<string> {
    return 'PermaShip';
  }

  async activateWorkspace(
    _token: string,
    platform: 'discord' | 'slack' | 'github',
    workspaceId: string,
    _activatedBy: string,
    _channelId: string,
  ): Promise<{ success: boolean; orgId?: string; orgName?: string; error?: string }> {
    return { success: true, orgId: this.orgId, orgName: 'PermaShip' };
  }

  shouldPrompt(
    _platform: 'discord' | 'slack' | 'github',
    _workspaceId: string,
    _channelId: string,
  ): boolean {
    return false;
  }
}
