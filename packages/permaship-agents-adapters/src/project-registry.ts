import type { ProjectRegistry, Project } from '../../../src/adapters/interfaces/project-registry.js';
import { apiRequest } from './client.js';

interface PaperclipWorkspace {
  repoUrl?: string | null;
}

interface PaperclipProject {
  id: string;
  name: string;
  urlKey: string;
  workspaces?: PaperclipWorkspace[];
  primaryWorkspace?: PaperclipWorkspace | null;
  codebase?: { repoUrl?: string | null; managedFolder?: string | null } | null;
}

function extractRepoKey(repoUrl: string | null | undefined): string | null {
  if (!repoUrl) return null;
  try {
    const url = new URL(repoUrl);
    // Strip leading slash and .git suffix: "/owner/repo.git" → "owner/repo"
    return url.pathname.replace(/^\//, '').replace(/\.git$/, '') || null;
  } catch {
    return null;
  }
}

/**
 * Maps Nexus ProjectRegistry interface to GET /api/companies/:id/projects.
 */
export class PaperclipProjectRegistry implements ProjectRegistry {
  private orgId: string;

  constructor(orgId: string) {
    this.orgId = orgId;
  }

  private async fetchProjects(): Promise<PaperclipProject[]> {
    try {
      const result = await apiRequest<PaperclipProject[] | { items?: PaperclipProject[] }>(
        'GET',
        `/api/companies/${this.orgId}/projects`,
      );
      return Array.isArray(result) ? result : (result.items ?? []);
    } catch {
      return [];
    }
  }

  private getRepoUrl(project: PaperclipProject): string | null | undefined {
    return (
      project.codebase?.repoUrl ??
      project.primaryWorkspace?.repoUrl ??
      project.workspaces?.[0]?.repoUrl
    );
  }

  async listProjects(_orgId: string): Promise<Project[]> {
    const projects = await this.fetchProjects();
    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.urlKey,
      repoKey: extractRepoKey(this.getRepoUrl(p)),
    }));
  }

  async resolveProjectId(nameOrSlug: string, _orgId: string): Promise<string | undefined> {
    const projects = await this.fetchProjects();
    const lower = nameOrSlug.toLowerCase();
    return projects.find(
      (p) => p.name.toLowerCase() === lower || p.urlKey.toLowerCase() === lower,
    )?.id;
  }

  async resolveRepoKey(projectId: string, _orgId: string): Promise<string | undefined> {
    const projects = await this.fetchProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return undefined;
    return extractRepoKey(this.getRepoUrl(project)) ?? undefined;
  }

  async resolveProjectSlug(projectId: string, _orgId: string): Promise<string | undefined> {
    const projects = await this.fetchProjects();
    return projects.find((p) => p.id === projectId)?.urlKey;
  }
}
