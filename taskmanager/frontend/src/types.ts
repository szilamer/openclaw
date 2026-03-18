export type TaskStatus =
  | 'Beérkező'
  | 'Teendő'
  | 'Folyamatban'
  | 'Várakozás'
  | 'Felülvizsgálat'
  | 'Kész';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface ActiveAssignee {
  id: string;
  name: string;
  role: string;
  hasInProgress: boolean;
}

export interface ProjectContact {
  id: string;
  projectId: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  isExternal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  user: { id: string; name: string | null; email: string; role: string };
}

export type SubProjectStatus = 'active' | 'completed' | 'archived';
export type PlanningStatus = 'none' | 'pending' | 'triggered' | 'in_progress' | 'completed' | 'failed';

export interface SubProject {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  requirements: string | null;
  color: string | null;
  status: SubProjectStatus;
  planningStatus: PlanningStatus;
  planningTaskId: string | null;
  createdAt: string;
  updatedAt: string;
  taskCount?: number;
  progress?: number;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  color: string | null;
  priority: number;
  knowledgeBase: string | null;
  kbFileName: string | null;
  kbSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  activeAssignees?: ActiveAssignee[];
  contactCount?: number;
  memberCount?: number;
  subProjectCount?: number;
  members?: ProjectMember[];
  contacts?: ProjectContact[];
  subProjects?: SubProject[];
}

export interface KbSyncStatus {
  linked: boolean;
  kbFileName: string | null;
  kbSyncedAt: string | null;
  fileMtime: string | null;
  inSync: boolean | null;
}

export interface Task {
  id: string;
  shortId: number;
  projectId: string;
  subProjectId: string | null;
  subProject?: { id: string; name: string; color: string | null; status: SubProjectStatus } | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  assignee?: { id: string; name: string | null; email: string; role: string } | null;
  dueAt: string | null;
  startAt: string | null;
  estimatedHours: number | null;
  sourceType: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  liveStatus?: string | null;
  liveStatusUpdatedAt?: string | null;
  notes?: string | null;
  comments?: TaskComment[];
  labelLinks?: { label: { id: string; name: string; color: string } }[];
  dependsOn?: { prerequisiteId: string }[];
}

export interface TaskComment {
  id: string;
  content: string;
  createdAt: string;
  user?: { name: string | null };
}

export const STATUS_ORDER: TaskStatus[] = [
  'Beérkező',
  'Teendő',
  'Folyamatban',
  'Várakozás',
  'Felülvizsgálat',
  'Kész',
];

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  extension?: string;
  children?: FileNode[];
}

export interface FileRoot {
  name: string;
  basePath: string;
  children: FileNode[];
}
