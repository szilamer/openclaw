import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTaskDto,
  UpdateTaskDto,
  UpdateLiveStatusDto,
} from './dto';
import { TaskStatus } from '@prisma/client';

const ASSIGNEE_SELECT = { id: true, name: true, email: true, role: true } as const;

/** ASCII-friendly aliases for TaskStatus (agents often use these). */
const STATUS_ALIASES: Record<string, TaskStatus> = {
  Teendo: 'Teendő',
  Beerkezo: 'Beérkező',
  Varakozas: 'Várakozás',
  Fulvizsgalat: 'Felülvizsgálat',
  Keszen: 'Kész',
};

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: {
    projectId?: string;
    subProjectId?: string;
    status?: TaskStatus | string;
    dueBefore?: string;
    assigneeId?: string;
    labelId?: string;
  }) {
    const where: any = { deletedAt: null };
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.subProjectId) where.subProjectId = filters.subProjectId;
    if (filters.status) {
      const status =
        STATUS_ALIASES[filters.status] ??
        (Object.values(TaskStatus).includes(filters.status as TaskStatus)
          ? (filters.status as TaskStatus)
          : null);
      if (!status) {
        throw new BadRequestException(
          `Invalid status "${filters.status}". Valid: ${Object.values(TaskStatus).join(', ')} (aliases: Teendo, Beerkezo, Varakozas, Fulvizsgalat, Keszen)`,
        );
      }
      where.status = status;
    }
    if (filters.assigneeId) where.assigneeId = filters.assigneeId;
    if (filters.dueBefore) {
      where.dueAt = { lte: new Date(filters.dueBefore) };
    }
    if (filters.labelId) {
      where.labelLinks = { some: { labelId: filters.labelId } };
    }

    return this.prisma.task.findMany({
      where,
      include: {
        assignee: { select: ASSIGNEE_SELECT },
        labelLinks: { include: { label: true } },
        dependsOn: { select: { prerequisiteId: true } },
        subProject: { select: { id: true, name: true, color: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(idOrShort: string) {
    const shortId = /^\d+$/.test(idOrShort) ? parseInt(idOrShort, 10) : null;
    const task = await this.prisma.task.findFirst({
      where: {
        deletedAt: null,
        ...(shortId !== null ? { shortId } : { id: idOrShort }),
      },
      include: {
        assignee: { select: ASSIGNEE_SELECT },
        labelLinks: { include: { label: true } },
        comments: { include: { user: { select: { name: true } } } },
        dependsOn: { select: { prerequisiteId: true } },
        subProject: { select: { id: true, name: true, color: true, status: true } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async create(dto: CreateTaskDto, tokenId?: string) {
    const task = await this.prisma.task.create({
      data: {
        projectId: dto.projectId,
        title: dto.title,
        description: dto.description,
        status: dto.status ?? 'Teendő',
        priority: dto.priority ?? 'medium',
        assigneeId: dto.assigneeId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        startAt: dto.startAt ? new Date(dto.startAt) : null,
        estimatedHours: dto.estimatedHours ?? null,
        subProjectId: dto.subProjectId ?? null,
        sourceType: dto.sourceType ?? 'agent',
        sourceRef: dto.sourceRef,
        labelLinks: dto.labelIds?.length
          ? {
              create: dto.labelIds.map((labelId) => ({ labelId })),
            }
          : undefined,
      },
      include: {
        assignee: { select: ASSIGNEE_SELECT },
        labelLinks: { include: { label: true } },
      },
    });

    if (tokenId) {
      await this.prisma.agentAction.create({
        data: {
          tokenId,
          taskId: task.id,
          actionType: 'create',
          payloadHash: JSON.stringify({ title: dto.title }),
        },
      });
    }
    return task;
  }

  private async resolveId(idOrShort: string): Promise<string> {
    if (/^\d+$/.test(idOrShort)) {
      const task = await this.prisma.task.findUnique({
        where: { shortId: parseInt(idOrShort, 10) },
        select: { id: true },
      });
      if (!task) throw new NotFoundException('Task not found');
      return task.id;
    }
    return idOrShort;
  }

  async update(id: string, dto: UpdateTaskDto, tokenId?: string) {
    id = await this.resolveId(id);
    const existing = await this.findOne(id);
    const updateData: any = {
      ...(dto.title && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.status && { status: dto.status }),
      ...(dto.priority && { priority: dto.priority }),
      ...(dto.assigneeId !== undefined && { assigneeId: dto.assigneeId }),
      ...(dto.dueAt !== undefined && {
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      }),
      ...(dto.projectId && { projectId: dto.projectId }),
      ...(dto.liveStatus !== undefined && {
        liveStatus: dto.liveStatus,
        liveStatusUpdatedAt: new Date(),
      }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(dto.startAt !== undefined && {
        startAt: dto.startAt ? new Date(dto.startAt) : null,
      }),
      ...(dto.estimatedHours !== undefined && {
        estimatedHours: dto.estimatedHours,
      }),
      ...(dto.subProjectId !== undefined && {
        subProjectId: dto.subProjectId || null,
      }),
    };
    if (dto.status === 'Kész') {
      updateData.closedAt = new Date();
    }
    if (dto.labelIds) {
      await this.prisma.taskLabelLink.deleteMany({ where: { taskId: id } });
      if (dto.labelIds.length) {
        await this.prisma.taskLabelLink.createMany({
          data: dto.labelIds.map((labelId) => ({ taskId: id, labelId })),
        });
      }
    }

    const task = await this.prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        assignee: { select: ASSIGNEE_SELECT },
        labelLinks: { include: { label: true } },
      },
    });

    if (dto.status && dto.status !== existing.status && tokenId) {
      await this.prisma.taskStatusHistory.create({
        data: {
          taskId: id,
          fromStatus: existing.status,
          toStatus: dto.status,
          changedBy: 'agent',
        },
      });
      await this.prisma.agentAction.create({
        data: {
          tokenId,
          taskId: id,
          actionType: 'status_change',
          payloadHash: JSON.stringify({ status: dto.status }),
        },
      });
    }
    return task;
  }

  async move(id: string, status: TaskStatus, tokenId?: string) {
    id = await this.resolveId(id);
    const existing = await this.findOne(id);
    await this.prisma.task.update({
      where: { id },
      data: {
        status,
        ...(status === 'Kész' && { closedAt: new Date() }),
      },
    });
    await this.prisma.taskStatusHistory.create({
      data: {
        taskId: id,
        fromStatus: existing.status,
        toStatus: status,
        changedBy: 'agent',
      },
    });
    if (tokenId) {
      await this.prisma.agentAction.create({
        data: {
          tokenId,
          taskId: id,
          actionType: 'status_change',
          payloadHash: JSON.stringify({ status }),
        },
      });
    }
    return this.findOne(id);
  }

  async updateLiveStatus(id: string, liveStatus: string) {
    id = await this.resolveId(id);
    await this.findOne(id);
    return this.prisma.task.update({
      where: { id },
      data: {
        liveStatus: liveStatus || null,
        liveStatusUpdatedAt: new Date(),
      },
      select: { id: true, liveStatus: true, liveStatusUpdatedAt: true },
    });
  }

  async updateNotes(id: string, notes: string) {
    id = await this.resolveId(id);
    await this.findOne(id);
    return this.prisma.task.update({
      where: { id },
      data: { notes },
      select: { id: true, notes: true },
    });
  }

  async addComment(taskId: string, content: string, userId: string) {
    taskId = await this.resolveId(taskId);
    await this.findOne(taskId);
    return this.prisma.taskComment.create({
      data: { taskId, userId, content },
      include: { user: { select: { name: true } } },
    });
  }

  async addDependency(taskId: string, prerequisiteId: string) {
    taskId = await this.resolveId(taskId);
    prerequisiteId = await this.resolveId(prerequisiteId);
    if (taskId === prerequisiteId) {
      throw new BadRequestException('A task cannot depend on itself');
    }
    await this.findOne(taskId);
    await this.findOne(prerequisiteId);
    return this.prisma.taskDependency.create({
      data: { dependentId: taskId, prerequisiteId },
    });
  }

  async removeDependency(taskId: string, prerequisiteId: string) {
    taskId = await this.resolveId(taskId);
    prerequisiteId = await this.resolveId(prerequisiteId);
    const dep = await this.prisma.taskDependency.findUnique({
      where: {
        dependentId_prerequisiteId: { dependentId: taskId, prerequisiteId },
      },
    });
    if (!dep) throw new NotFoundException('Dependency not found');
    return this.prisma.taskDependency.delete({ where: { id: dep.id } });
  }

  async getDependencies(taskId: string) {
    taskId = await this.resolveId(taskId);
    return this.prisma.taskDependency.findMany({
      where: { dependentId: taskId },
      include: {
        prerequisite: {
          select: { id: true, shortId: true, title: true, status: true },
        },
      },
    });
  }
}
