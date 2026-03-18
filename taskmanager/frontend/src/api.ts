const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') ||
  (window.location.port === '3001' ? 'http://localhost:3000' : '');

const TOKEN_KEY = 'taskmanager_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function fetchApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  if (!token) {
    throw new Error('Token nincs beállítva');
  }

  const base = API_BASE || '';
  const url = path.startsWith('http')
    ? path
    : `${base}${path.startsWith('/') ? path : '/' + path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

export const api = {
  users: {
    list: () => fetchApi<User[]>('/api/users'),
  },
  projects: {
    list: () => fetchApi<Project[]>('/api/projects'),
    get: (id: string) => fetchApi<Project>(`/api/projects/${id}`),
    create: (data: { name: string; description?: string; color?: string }) =>
      fetchApi<Project>('/api/projects', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<{
        name: string;
        description: string;
        image: string;
        color: string;
        priority: number;
        knowledgeBase: string;
      }>,
    ) =>
      fetchApi<Project>(`/api/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchApi<Project>(`/api/projects/${id}`, { method: 'DELETE' }),
    tasks: (id: string) => fetchApi<Task[]>(`/api/projects/${id}/tasks`),
    // Contacts
    contacts: (id: string) =>
      fetchApi<ProjectContact[]>(`/api/projects/${id}/contacts`),
    addContact: (
      id: string,
      data: {
        name: string;
        role?: string;
        email?: string;
        phone?: string;
        company?: string;
        notes?: string;
        isExternal?: boolean;
      },
    ) =>
      fetchApi<ProjectContact>(`/api/projects/${id}/contacts`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateContact: (
      contactId: string,
      data: Partial<{
        name: string;
        role: string;
        email: string;
        phone: string;
        company: string;
        notes: string;
        isExternal: boolean;
      }>,
    ) =>
      fetchApi<ProjectContact>(`/api/projects/contacts/${contactId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    removeContact: (contactId: string) =>
      fetchApi<ProjectContact>(`/api/projects/contacts/${contactId}`, {
        method: 'DELETE',
      }),
    // Members
    members: (id: string) =>
      fetchApi<ProjectMember[]>(`/api/projects/${id}/members`),
    setMembers: (id: string, userIds: string[]) =>
      fetchApi<ProjectMember[]>(`/api/projects/${id}/members`, {
        method: 'PUT',
        body: JSON.stringify({ userIds }),
      }),
    // KB Sync
    kbStatus: (id: string) =>
      fetchApi<KbSyncStatus>(`/api/projects/${id}/kb-status`),
    kbFiles: () => fetchApi<string[]>('/api/projects/kb-files'),
    linkKb: (id: string, fileName: string) =>
      fetchApi<{ success: boolean }>(`/api/projects/${id}/link-kb`, {
        method: 'POST',
        body: JSON.stringify({ fileName }),
      }),
    syncKb: () =>
      fetchApi<{ synced: number; total: number }>('/api/projects/sync-kb', {
        method: 'POST',
      }),
    // Sub-Projects
    subProjects: (projectId: string) =>
      fetchApi<SubProject[]>(`/api/projects/${projectId}/sub-projects`),
    createSubProject: (
      projectId: string,
      data: { name: string; description?: string; requirements?: string; color?: string },
    ) =>
      fetchApi<SubProject>(`/api/projects/${projectId}/sub-projects`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getSubProject: (subId: string) =>
      fetchApi<SubProject>(`/api/projects/sub-projects/${subId}`),
    updateSubProject: (
      subId: string,
      data: Partial<{ name: string; description: string; requirements: string; color: string; status: string; planningStatus: string }>,
    ) =>
      fetchApi<SubProject>(`/api/projects/sub-projects/${subId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    removeSubProject: (subId: string) =>
      fetchApi<SubProject>(`/api/projects/sub-projects/${subId}`, {
        method: 'DELETE',
      }),
    triggerPlanning: (subId: string) =>
      fetchApi<{ triggered: boolean; taskId: string; taskShortId: number }>(
        `/api/projects/sub-projects/${subId}/trigger-planning`,
        { method: 'POST' },
      ),
  },
  tasks: {
    list: (params?: { project?: string; status?: string }) => {
      const q = new URLSearchParams(
        params as Record<string, string>,
      ).toString();
      return fetchApi<Task[]>(`/api/tasks${q ? `?${q}` : ''}`);
    },
    get: (id: string) => fetchApi<Task>(`/api/tasks/${id}`),
    create: (data: {
      projectId: string;
      title: string;
      description?: string;
      status?: string;
      priority?: string;
      assigneeId?: string | null;
      dueAt?: string | null;
      startAt?: string | null;
      estimatedHours?: number | null;
      subProjectId?: string | null;
    }) =>
      fetchApi<Task>('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ ...data, sourceType: 'manual' }),
      }),
    update: (
      id: string,
      data: Partial<{
        title: string;
        description: string;
        status: string;
        priority: string;
        assigneeId: string | null;
        dueAt: string | null;
        startAt: string | null;
        estimatedHours: number | null;
        projectId: string;
        subProjectId: string | null;
        liveStatus: string;
        notes: string;
      }>,
    ) =>
      fetchApi<Task>(`/api/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    move: (id: string, status: string) =>
      fetchApi<Task>(`/api/tasks/${id}/move`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),
    addComment: (id: string, content: string) =>
      fetchApi<{ id: string; content: string; createdAt: string }>(
        `/api/tasks/${id}/comments`,
        { method: 'POST', body: JSON.stringify({ content }) },
      ),
    updateLiveStatus: (id: string, liveStatus: string) =>
      fetchApi<{
        id: string;
        liveStatus: string | null;
        liveStatusUpdatedAt: string | null;
      }>(`/api/tasks/${id}/live-status`, {
        method: 'PATCH',
        body: JSON.stringify({ liveStatus }),
      }),
    updateNotes: (id: string, notes: string) =>
      fetchApi<{ id: string; notes: string | null }>(
        `/api/tasks/${id}/notes`,
        { method: 'PATCH', body: JSON.stringify({ notes }) },
      ),
    addDependency: (taskId: string, prerequisiteId: string) =>
      fetchApi<{ id: string }>(`/api/tasks/${taskId}/dependencies`, {
        method: 'POST',
        body: JSON.stringify({ prerequisiteId }),
      }),
    removeDependency: (taskId: string, prerequisiteId: string) =>
      fetchApi<{ id: string }>(
        `/api/tasks/${taskId}/dependencies/${prerequisiteId}`,
        { method: 'DELETE' },
      ),
  },
  resources: {
    summary: () => fetchApi<any>('/api/resources/summary'),
    config: () => fetchApi<any>('/api/resources/config'),
    cronJobs: () => fetchApi<any[]>('/api/resources/cron-jobs'),
    cronHistory: (days = 14) =>
      fetchApi<any[]>(`/api/resources/cron-history?days=${days}`),
    dailyUsage: (days = 14) =>
      fetchApi<any[]>(`/api/resources/daily-usage?days=${days}`),
    updateBudget: (data: {
      dailyMaxUsd?: number | null;
      warningThresholdPct?: number;
      strategy?: string;
      fallbackModel?: string | null;
    }) =>
      fetchApi<any>('/api/resources/budget', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },
  agents: {
    list: () => fetchApi<any>('/api/agents'),
    activity: (id: string, limit = 30) =>
      fetchApi<any[]>(`/api/agents/${id}/activity?limit=${limit}`),
    availableModels: () =>
      fetchApi<{
        models: {
          id: string;
          provider: string;
          name: string;
          tier: 'subscription' | 'api';
          hasApiKey: boolean;
        }[];
      }>('/api/agents/available-models'),
    create: (data: {
      id: string;
      name: string;
      theme?: string;
      emoji?: string;
      model?: string;
    }) =>
      fetchApi<any>('/api/agents', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: {
        name?: string;
        model?: string;
        fallbacks?: string[];
        theme?: string;
        emoji?: string;
      },
    ) =>
      fetchApi<any>(`/api/agents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },
  files: {
    tree: () => fetchApi<FileRoot[]>('/api/files/tree'),
    content: (root: string, path: string) =>
      fetchApi<{ content: string; size: number; editable: boolean }>(
        `/api/files/content?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`,
      ),
    save: (root: string, path: string, content: string) =>
      fetchApi<{ success: boolean; size: number }>('/api/files/content', {
        method: 'PUT',
        body: JSON.stringify({ root, path, content }),
      }),
  },
};

import type { Project, Task, FileRoot, ProjectContact, ProjectMember, KbSyncStatus, SubProject } from './types';
