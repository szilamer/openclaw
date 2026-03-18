import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailIntakeDto } from './dto';
import { TaskSourceType } from '@prisma/client';

const DEFAULT_PROJECT_NAME = 'Logframe Adminisztráció';

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Resolve the best-matching project for an email based on:
   * 1. Explicit projectId in the DTO
   * 2. Sender email domain/address matched against ProjectContact.email
   * 3. Keyword matching in subject/body against project names
   * 4. Fallback to "Logframe Adminisztráció"
   */
  private async resolveProject(dto: EmailIntakeDto): Promise<string | null> {
    if (dto.projectId) {
      const explicit = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
      });
      if (explicit) return explicit.id;
    }

    const senderEmail = this.extractEmail(dto.from);
    const senderDomain = senderEmail?.split('@')[1]?.toLowerCase();

    // Match sender email against project contacts
    if (senderEmail) {
      const contactMatch = await this.prisma.projectContact.findFirst({
        where: {
          email: { not: null },
          OR: [
            { email: { equals: senderEmail, mode: 'insensitive' } },
            ...(senderDomain
              ? [{ email: { endsWith: `@${senderDomain}`, mode: 'insensitive' as const } }]
              : []),
          ],
        },
        include: { project: true },
      });
      if (contactMatch) {
        this.logger.log(
          `Email from ${senderEmail} matched contact "${contactMatch.name}" → project "${contactMatch.project.name}"`,
        );
        return contactMatch.projectId;
      }
    }

    // Keyword matching: check if subject/body contains project-related terms
    const haystack =
      `${dto.from} ${dto.subject} ${dto.body || ''}`.toLowerCase();
    const projects = await this.prisma.project.findMany({
      include: { contacts: true },
    });

    const KEYWORD_MAP: Record<string, string[]> = {};
    for (const p of projects) {
      const keywords: string[] = [];
      const nameParts = p.name
        .toLowerCase()
        .replace(/- projekt$/i, '')
        .replace(/kft\.?$/i, '')
        .split(/\s+/)
        .filter((w) => w.length > 3);
      keywords.push(...nameParts);
      for (const c of p.contacts) {
        if (c.company) keywords.push(c.company.toLowerCase());
        if (c.email) {
          const domain = c.email.split('@')[1];
          if (domain) keywords.push(domain.toLowerCase());
        }
      }
      if (keywords.length > 0) KEYWORD_MAP[p.id] = keywords;
    }

    let bestId: string | null = null;
    let bestScore = 0;
    for (const [pid, keywords] of Object.entries(KEYWORD_MAP)) {
      let score = 0;
      for (const kw of keywords) {
        if (haystack.includes(kw)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestId = pid;
      }
    }

    if (bestId && bestScore > 0) {
      const matched = projects.find((p) => p.id === bestId);
      this.logger.log(
        `Email keyword match (score ${bestScore}) → project "${matched?.name}"`,
      );
      return bestId;
    }

    // Fallback
    const fallback = projects.find((p) =>
      p.name.toLowerCase().includes('logframe admin'),
    );
    return fallback?.id || projects[0]?.id || null;
  }

  private extractEmail(fromField: string): string | null {
    const match = fromField.match(/<([^>]+)>/) || fromField.match(/([\w.+-]+@[\w.-]+)/);
    return match ? match[1].toLowerCase() : null;
  }

  async intake(dto: EmailIntakeDto) {
    const email = await this.prisma.emailMessage.upsert({
      where: { sourceUid: dto.source_uid },
      update: {},
      create: {
        from: dto.from,
        to: dto.to,
        subject: dto.subject,
        date: new Date(dto.date),
        body: dto.body,
        sourceUid: dto.source_uid,
      },
    });

    const tasks: any[] = [];
    if (dto.auto_create_task) {
      const projectId = await this.resolveProject(dto);
      if (projectId) {
        const task = await this.prisma.task.create({
          data: {
            projectId,
            title: dto.subject,
            description: dto.body?.slice(0, 2000),
            sourceType: TaskSourceType.email,
            sourceRef: dto.source_uid,
          },
        });
        await this.prisma.emailTaskLink.create({
          data: { emailId: email.id, taskId: task.id },
        });
        tasks.push(task);
      }
    }

    return { email, tasks };
  }

  /**
   * Returns the project routing map: for each project, the associated
   * contact emails and keywords that would match. Useful for the
   * email processing script to do client-side routing.
   */
  async getRoutingMap(): Promise<
    {
      projectId: string;
      projectName: string;
      contactEmails: string[];
      contactDomains: string[];
      keywords: string[];
    }[]
  > {
    const projects = await this.prisma.project.findMany({
      include: { contacts: true },
    });

    return projects.map((p) => {
      const contactEmails = p.contacts
        .map((c) => c.email?.toLowerCase())
        .filter(Boolean) as string[];
      const contactDomains = [
        ...new Set(
          contactEmails
            .map((e) => e.split('@')[1])
            .filter(Boolean),
        ),
      ];
      const keywords = p.name
        .toLowerCase()
        .replace(/- projekt$/i, '')
        .replace(/kft\.?$/i, '')
        .split(/\s+/)
        .filter((w) => w.length > 3);
      for (const c of p.contacts) {
        if (c.company) keywords.push(c.company.toLowerCase());
      }

      return {
        projectId: p.id,
        projectName: p.name,
        contactEmails,
        contactDomains,
        keywords: [...new Set(keywords)],
      };
    });
  }
}
