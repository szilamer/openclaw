import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatus } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getDailySummary(dateStr?: string) {
    const date = dateStr ? new Date(dateStr) : new Date();
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const [overdue, dueToday, dueSoon, completed] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          deletedAt: null,
          status: { not: 'Kész' },
          dueAt: { lt: start },
        },
        select: { id: true, title: true, dueAt: true, status: true },
      }),
      this.prisma.task.findMany({
        where: {
          deletedAt: null,
          status: { not: 'Kész' },
          dueAt: { gte: start, lte: end },
        },
        select: { id: true, title: true, dueAt: true },
      }),
      this.prisma.task.findMany({
        where: {
          deletedAt: null,
          status: { not: 'Kész' },
          dueAt: { gt: end, lte: new Date(end.getTime() + 48 * 60 * 60 * 1000) },
        },
        select: { id: true, title: true, dueAt: true },
      }),
      this.prisma.task.findMany({
        where: {
          closedAt: { gte: start, lte: end },
        },
        select: { id: true, title: true, closedAt: true },
      }),
    ]);

    return {
      date: date.toISOString().slice(0, 10),
      overdue: overdue.length,
      overdueTasks: overdue,
      dueToday: dueToday.length,
      dueTodayTasks: dueToday,
      dueWithin48h: dueSoon.length,
      dueWithin48hTasks: dueSoon,
      completedToday: completed.length,
      completedTasks: completed,
    };
  }
}
