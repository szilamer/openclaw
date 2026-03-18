import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  CreateContactDto,
  UpdateContactDto,
  SetMembersDto,
  CreateSubProjectDto,
  UpdateSubProjectDto,
} from './dto';
import * as fs from 'fs';
import * as path from 'path';

const KB_DIR =
  process.env.OPENCLAW_DATA_PATH
    ? path.join(process.env.OPENCLAW_DATA_PATH, 'workspace', 'memory', 'projects')
    : '/data/openclaw/workspace/memory/projects';

const SYNC_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

@Injectable()
export class ProjectsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProjectsService.name);
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log(`KB sync dir: ${KB_DIR}`);
    this.syncTimer = setInterval(() => {
      this.syncAllFromFiles().catch((err) =>
        this.logger.error('KB sync error', err),
      );
    }, SYNC_INTERVAL_MS);
    setTimeout(() => {
      this.syncAllFromFiles().catch((err) =>
        this.logger.error('KB initial sync error', err),
      );
    }, 5000);
  }

  onModuleDestroy() {
    if (this.syncTimer) clearInterval(this.syncTimer);
  }

  async findAll() {
    const ACTIVE_STATUSES = [
      'Teendő',
      'Folyamatban',
      'Várakozás',
      'Felülvizsgálat',
    ] as const;

    const projects = await this.prisma.project.findMany({
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      include: {
        tasks: {
          where: {
            deletedAt: null,
            status: { in: [...ACTIVE_STATUSES] },
            assigneeId: { not: null },
          },
          select: {
            status: true,
            assignee: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
        },
        _count: { select: { contacts: true, members: true, subProjects: true } },
        subProjects: {
          orderBy: { name: 'asc' },
          include: {
            _count: { select: { tasks: true } },
            tasks: {
              where: { deletedAt: null },
              select: { status: true },
            },
          },
        },
      },
    });

    return projects.map(({ tasks, _count, subProjects, ...project }) => {
      const byAssignee = new Map<
        string,
        { id: string; name: string; role: string; hasInProgress: boolean }
      >();

      for (const t of tasks) {
        if (!t.assignee) continue;
        const entry = byAssignee.get(t.assignee.id);
        if (!entry) {
          byAssignee.set(t.assignee.id, {
            id: t.assignee.id,
            name: t.assignee.name || t.assignee.email,
            role: t.assignee.role,
            hasInProgress: t.status === 'Folyamatban',
          });
        } else if (t.status === 'Folyamatban') {
          entry.hasInProgress = true;
        }
      }

      const enrichedSubProjects = subProjects.map(({ tasks: spTasks, _count: spCount, ...sp }) => {
        const total = spTasks.length;
        const done = spTasks.filter((t) => t.status === 'Kész').length;
        return {
          ...sp,
          taskCount: spCount.tasks,
          progress: total > 0 ? Math.round((done / total) * 100) : 0,
        };
      });

      return {
        ...project,
        contactCount: _count.contacts,
        memberCount: _count.members,
        subProjectCount: _count.subProjects,
        activeAssignees: Array.from(byAssignee.values()),
        subProjects: enrichedSubProjects,
      };
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        tasks: { where: { deletedAt: null } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        contacts: { orderBy: { name: 'asc' } },
        subProjects: { orderBy: { name: 'asc' } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async create(dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        color: dto.color,
        priority: dto.priority ?? 5,
      },
    });
  }

  async update(id: string, dto: UpdateProjectDto) {
    const existing = await this.findOne(id);
    const result = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.image !== undefined && { image: dto.image }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.knowledgeBase !== undefined && {
          knowledgeBase: dto.knowledgeBase,
        }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.kbFileName !== undefined && { kbFileName: dto.kbFileName }),
      },
    });

    if (dto.knowledgeBase !== undefined) {
      const fileName = result.kbFileName || existing.kbFileName;
      if (fileName) {
        this.writeKbFile(fileName, dto.knowledgeBase);
        await this.prisma.project.update({
          where: { id },
          data: { kbSyncedAt: new Date() },
        });
      }
    }

    return result;
  }

  async getTasks(id: string) {
    await this.findOne(id);
    return this.prisma.task.findMany({
      where: { projectId: id, deletedAt: null },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.project.delete({ where: { id } });
  }

  // ── Contacts ──

  async getContacts(id: string) {
    await this.findOne(id);
    return this.prisma.projectContact.findMany({
      where: { projectId: id },
      orderBy: { name: 'asc' },
    });
  }

  async addContact(projectId: string, dto: CreateContactDto) {
    await this.findOne(projectId);
    return this.prisma.projectContact.create({
      data: {
        projectId,
        name: dto.name,
        role: dto.role,
        email: dto.email,
        phone: dto.phone,
        company: dto.company,
        notes: dto.notes,
        isExternal: dto.isExternal ?? true,
      },
    });
  }

  async updateContact(contactId: string, dto: UpdateContactDto) {
    const contact = await this.prisma.projectContact.findUnique({
      where: { id: contactId },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return this.prisma.projectContact.update({
      where: { id: contactId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.company !== undefined && { company: dto.company }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.isExternal !== undefined && { isExternal: dto.isExternal }),
      },
    });
  }

  async removeContact(contactId: string) {
    const contact = await this.prisma.projectContact.findUnique({
      where: { id: contactId },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return this.prisma.projectContact.delete({ where: { id: contactId } });
  }

  // ── KB File Sync ──

  private writeKbFile(fileName: string, content: string): void {
    try {
      const filePath = path.join(KB_DIR, fileName);
      fs.mkdirSync(KB_DIR, { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
      this.logger.log(`KB file written: ${fileName}`);
    } catch (err) {
      this.logger.error(`Failed to write KB file ${fileName}`, err);
    }
  }

  private readKbFile(fileName: string): { content: string; mtime: Date } | null {
    try {
      const filePath = path.join(KB_DIR, fileName);
      if (!fs.existsSync(filePath)) return null;
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      return { content, mtime: stat.mtime };
    } catch {
      return null;
    }
  }

  async syncAllFromFiles(): Promise<{ synced: number; total: number }> {
    const projects = await this.prisma.project.findMany({
      where: { kbFileName: { not: null } },
      select: {
        id: true,
        kbFileName: true,
        knowledgeBase: true,
        kbSyncedAt: true,
        updatedAt: true,
      },
    });

    let synced = 0;
    for (const p of projects) {
      if (!p.kbFileName) continue;
      const file = this.readKbFile(p.kbFileName);
      if (!file) continue;

      const fileContent = file.content.trim();
      const dbContent = (p.knowledgeBase || '').trim();

      if (fileContent === dbContent) continue;

      const fileMtime = file.mtime;
      const lastSync = p.kbSyncedAt || new Date(0);

      if (fileMtime > lastSync) {
        await this.prisma.project.update({
          where: { id: p.id },
          data: {
            knowledgeBase: file.content,
            kbSyncedAt: new Date(),
          },
        });
        synced++;
        this.logger.log(`KB synced from file: ${p.kbFileName}`);
      }
    }

    if (synced > 0) {
      this.logger.log(`KB sync: ${synced}/${projects.length} updated`);
    }
    return { synced, total: projects.length };
  }

  async getKbSyncStatus(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: {
        kbFileName: true,
        kbSyncedAt: true,
        knowledgeBase: true,
        updatedAt: true,
      },
    });
    if (!project) throw new NotFoundException('Project not found');

    if (!project.kbFileName) {
      return { linked: false, kbFileName: null, kbSyncedAt: null, fileMtime: null, inSync: null };
    }

    const file = this.readKbFile(project.kbFileName);
    const fileMtime = file?.mtime?.toISOString() || null;
    const inSync = file
      ? file.content.trim() === (project.knowledgeBase || '').trim()
      : false;

    return {
      linked: true,
      kbFileName: project.kbFileName,
      kbSyncedAt: project.kbSyncedAt?.toISOString() || null,
      fileMtime,
      inSync,
    };
  }

  async linkKbFile(id: string, fileName: string): Promise<void> {
    const project = await this.findOne(id);
    const file = this.readKbFile(fileName);

    await this.prisma.project.update({
      where: { id },
      data: { kbFileName: fileName },
    });

    if (file && !(project.knowledgeBase || '').trim()) {
      await this.prisma.project.update({
        where: { id },
        data: { knowledgeBase: file.content, kbSyncedAt: new Date() },
      });
    } else if (!file && (project.knowledgeBase || '').trim()) {
      this.writeKbFile(fileName, project.knowledgeBase!);
      await this.prisma.project.update({
        where: { id },
        data: { kbSyncedAt: new Date() },
      });
    }
  }

  listKbFiles(): string[] {
    try {
      if (!fs.existsSync(KB_DIR)) return [];
      return fs
        .readdirSync(KB_DIR)
        .filter((f) => f.endsWith('.md') && f !== '_TEMPLATE.md')
        .sort();
    } catch {
      return [];
    }
  }

  // ── Members (access control) ──

  async getMembers(id: string) {
    return this.prisma.projectMember.findMany({
      where: { projectId: id },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });
  }

  async setMembers(projectId: string, dto: SetMembersDto) {
    await this.findOne(projectId);

    await this.prisma.$transaction(async (tx) => {
      await tx.projectMember.deleteMany({ where: { projectId } });
      if (dto.userIds.length > 0) {
        await tx.projectMember.createMany({
          data: dto.userIds.map((userId) => ({
            projectId,
            userId,
            role: 'member',
          })),
          skipDuplicates: true,
        });
      }
    });

    return this.getMembers(projectId);
  }

  // ── Sub-Projects ──

  async getSubProjects(projectId: string) {
    await this.findOne(projectId);
    const subProjects = await this.prisma.subProject.findMany({
      where: { projectId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { tasks: true } },
        tasks: {
          where: { deletedAt: null },
          select: { status: true },
        },
      },
    });

    return subProjects.map(({ tasks, _count, ...sp }) => {
      const total = tasks.length;
      const done = tasks.filter((t) => t.status === 'Kész').length;
      return {
        ...sp,
        taskCount: _count.tasks,
        progress: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    });
  }

  async getSubProject(id: string) {
    const sp = await this.prisma.subProject.findUnique({
      where: { id },
      include: {
        tasks: {
          where: { deletedAt: null },
          include: {
            assignee: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!sp) throw new NotFoundException('Sub-project not found');
    return sp;
  }

  async createSubProject(projectId: string, dto: CreateSubProjectDto) {
    await this.findOne(projectId);
    const sp = await this.prisma.subProject.create({
      data: {
        projectId,
        name: dto.name,
        description: dto.description,
        requirements: dto.requirements,
        color: dto.color,
        planningStatus: dto.requirements?.trim() ? 'pending' : 'none',
      },
    });

    if (dto.requirements?.trim()) {
      await this.triggerPlanning(sp.id).catch((err) =>
        this.logger.error(`Auto-trigger failed for ${sp.id}`, err),
      );
    }

    return this.prisma.subProject.findUnique({ where: { id: sp.id } });
  }

  async updateSubProject(id: string, dto: UpdateSubProjectDto) {
    const existing = await this.prisma.subProject.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Sub-project not found');

    const requirementsChanged =
      dto.requirements !== undefined && dto.requirements !== existing.requirements;

    const result = await this.prisma.subProject.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.requirements !== undefined && { requirements: dto.requirements }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.status !== undefined && { status: dto.status as any }),
        ...(dto.planningStatus !== undefined && { planningStatus: dto.planningStatus as any }),
        ...(requirementsChanged && dto.requirements?.trim() && { planningStatus: 'pending' as any }),
      },
    });

    if (requirementsChanged && dto.requirements?.trim()) {
      await this.triggerPlanning(id).catch((err) =>
        this.logger.error(`Auto-trigger failed for ${id}`, err),
      );
    }

    return result;
  }

  async removeSubProject(id: string) {
    const existing = await this.prisma.subProject.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Sub-project not found');
    await this.prisma.task.updateMany({
      where: { subProjectId: id },
      data: { subProjectId: null },
    });
    return this.prisma.subProject.delete({ where: { id } });
  }

  async triggerPlanning(subProjectId: string) {
    const sp = await this.prisma.subProject.findUnique({
      where: { id: subProjectId },
      include: { project: { select: { id: true, name: true } } },
    });
    if (!sp) throw new NotFoundException('Sub-project not found');
    if (!sp.requirements?.trim()) {
      throw new BadRequestException('No requirements defined for this sub-project');
    }

    if (sp.planningStatus === 'in_progress' || sp.planningStatus === 'completed') {
      throw new BadRequestException(
        `Planning is already ${sp.planningStatus === 'in_progress' ? 'in progress' : 'completed'}`,
      );
    }

    const sophon = await this.prisma.user.findFirst({
      where: { role: 'agent', email: { contains: 'sophon' } },
    });
    if (!sophon) {
      this.logger.error('Sophon agent user not found');
      await this.prisma.subProject.update({
        where: { id: subProjectId },
        data: { planningStatus: 'failed' },
      });
      throw new NotFoundException('Sophon agent user not found');
    }

    const szilamer = await this.prisma.user.findFirst({
      where: { role: 'user' },
    });

    const taskTitle = `[TERVEZÉS] ${sp.project.name} / ${sp.name} — Projekt tervezés`;
    const taskDescription = [
      `## Projekt tervezési feladat`,
      ``,
      `**Projektcsoport:** ${sp.project.name}`,
      `**Projekt:** ${sp.name}`,
      `**Projekt ID:** ${subProjectId}`,
      ``,
      `### Követelmények`,
      ``,
      sp.requirements,
      ``,
      `---`,
      ``,
      `### Feladat Sophon számára`,
      ``,
      `1. **Bontsd feladatokra** a fenti követelményeket. Minden feladat legyen önálló, végrehajtható egység.`,
      `2. **Jelölj ki felelőst** minden feladathoz (Sophon Agent vagy Szilamér).`,
      `3. **Becsüld meg** az egyes feladatok erőforrás/token igényét és időtartamát (estimatedHours).`,
      `4. **Készíts javaslatot** a feladatok sorrendjére, függőségeire, és a párhuzamosíthatóságára.`,
      `5. **Állítsd össze** a tervet és írd bele ennek a tasknak a megjegyzéseibe.`,
      `6. **Szilamér jóváhagyása után:**`,
      `   - Hozd létre a feladatokat a TaskManager-ben (\`POST /api/tasks\`) a \`subProjectId: "${subProjectId}"\` megjelöléssel`,
      `   - Állítsd be a kezdési dátumokat és időtartamokat (startAt, estimatedHours)`,
      `   - Add hozzá a függőségeket (POST /api/tasks/:id/dependencies)`,
      `   - Frissítsd a projekt tervezési státuszát: \`PATCH /api/projects/sub-projects/${subProjectId}\` body: \`{"planningStatus": "completed"}\``,
      ``,
      `### Formátum a tervhez`,
      ``,
      `| # | Feladat | Felelős | Becsült idő | Függőségek | Token igény |`,
      `|---|---------|---------|-------------|-----------|-------------|`,
      `| 1 | ... | Sophon/Szilamér | ...h | - | ~... |`,
      ``,
      `> ⚠️ Miután Szilamér elfogadta a tervet, hajtsd végre a feladatok létrehozását automatikusan.`,
    ].join('\n');

    const planningTask = await this.prisma.task.create({
      data: {
        projectId: sp.project.id,
        subProjectId: subProjectId,
        title: taskTitle,
        description: taskDescription,
        status: 'Teendő',
        priority: 'high',
        assigneeId: szilamer?.id || sophon.id,
        sourceType: 'agent',
        sourceRef: `planning:${subProjectId}`,
      },
    });

    await this.prisma.subProject.update({
      where: { id: subProjectId },
      data: {
        planningStatus: 'triggered',
        planningTaskId: planningTask.id,
      },
    });

    this.logger.log(`Planning triggered for sub-project ${sp.name} → task ${planningTask.shortId}`);

    return {
      triggered: true,
      taskId: planningTask.id,
      taskShortId: planningTask.shortId,
    };
  }
}
