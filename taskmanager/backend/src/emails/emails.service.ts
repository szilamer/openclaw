import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  EmailIntakeDto,
  TriageRegisterDto,
  TriageReviewDto,
  TriageRuleCreateDto,
  TriageRulePatchDto,
} from './dto';
import { EmailTriageQueueStatus, TaskSourceType } from '@prisma/client';

const TRIAGE_RULE_KINDS = new Set([
  'sender_email',
  'sender_domain',
  'subject_contains',
  'body_contains',
  'regex_subject',
]);

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);

  constructor(private prisma: PrismaService) {}

  private extractEmail(fromField: string): string | null {
    const match =
      fromField.match(/<([^>]+)>/) || fromField.match(/([\w.+-]+@[\w.-]+)/);
    return match ? match[1].toLowerCase() : null;
  }

  private matchTriageRule(
    kind: string,
    pattern: string,
    dto: Pick<EmailIntakeDto, 'from' | 'subject' | 'body'>,
  ): boolean {
    const sender = this.extractEmail(dto.from)?.toLowerCase() || '';
    const domain = sender.split('@')[1] || '';
    const subj = (dto.subject || '').toLowerCase();
    const body = (dto.body || '').toLowerCase();
    const pLower = pattern.toLowerCase();

    switch (kind) {
      case 'sender_email':
        return sender === pLower;
      case 'sender_domain':
        return domain === pLower;
      case 'subject_contains':
        return subj.includes(pLower);
      case 'body_contains':
        return body.includes(pLower);
      case 'regex_subject':
        try {
          return new RegExp(pattern, 'i').test(dto.subject || '');
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  /** Highest priority = lowest priority number; first match wins. */
  private async applyTriageRules(
    dto: EmailIntakeDto,
  ): Promise<string | null> {
    const rules = await this.prisma.triageRoutingRule.findMany({
      where: { enabled: true },
      orderBy: { priority: 'asc' },
    });
    for (const r of rules) {
      if (this.matchTriageRule(r.kind, r.pattern, dto)) {
        this.logger.log(
          `Triage rule "${r.name || r.id}" (${r.kind}) → project ${r.projectId}`,
        );
        return r.projectId;
      }
    }
    return null;
  }

  /**
   * Resolve the best-matching project for an email based on:
   * 1. Explicit projectId in the DTO
   * 2. User-defined triage routing rules (Mission Control)
   * 3. Sender email domain/address matched against ProjectContact.email
   * 4. Keyword matching in subject/body against project names
   * 5. Fallback to "Logframe Adminisztráció"
   */
  private async resolveProject(dto: EmailIntakeDto): Promise<string | null> {
    if (dto.projectId) {
      const explicit = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
      });
      if (explicit) return explicit.id;
    }

    const ruleHit = await this.applyTriageRules(dto);
    if (ruleHit) return ruleHit;

    const senderEmail = this.extractEmail(dto.from);
    const senderDomain = senderEmail?.split('@')[1]?.toLowerCase();

    if (senderEmail) {
      const contactMatch = await this.prisma.projectContact.findFirst({
        where: {
          email: { not: null },
          OR: [
            { email: { equals: senderEmail, mode: 'insensitive' } },
            ...(senderDomain
              ? [
                  {
                    email: {
                      endsWith: `@${senderDomain}`,
                      mode: 'insensitive' as const,
                    },
                  },
                ]
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
          const d = c.email.split('@')[1];
          if (d) keywords.push(d.toLowerCase());
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

    const fallback = projects.find((p) =>
      p.name.toLowerCase().includes('logframe admin'),
    );
    return fallback?.id || projects[0]?.id || null;
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

    const tasks: unknown[] = [];
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
   * Triage sor: Stage 1-only register → awaiting_sophon (GPT cron dönt).
   * Ha van llm_model (Stage 2 egy lépésben beküldve), régi viselkedés maradhat.
   */
  async registerTriage(dto: TriageRegisterDto) {
    let stage1ProjectId: string | null = null;
    if (dto.stage1_project_id) {
      const p = await this.prisma.project.findUnique({
        where: { id: dto.stage1_project_id },
      });
      if (p) stage1ProjectId = p.id;
    }

    let suggestedProjectId: string | null = null;
    if (dto.suggested_project_id) {
      const p = await this.prisma.project.findUnique({
        where: { id: dto.suggested_project_id },
      });
      if (p) suggestedProjectId = p.id;
    }

    const hasStage2InPayload =
      dto.llm_model != null && String(dto.llm_model).trim() !== '';

    const hasStage1Signal =
      (dto.stage1_classification != null &&
        String(dto.stage1_classification).trim() !== '') ||
      (dto.stage1_model != null && String(dto.stage1_model).trim() !== '') ||
      (dto.stage1_rationale != null &&
        String(dto.stage1_rationale).trim() !== '') ||
      stage1ProjectId != null;

    let status: EmailTriageQueueStatus;

    if (!hasStage2InPayload && hasStage1Signal) {
      // Óránkénti Qwen: mindig Sophonra vár (GPT megerősíti irrelevanciát vagy taskot ad)
      status = EmailTriageQueueStatus.awaiting_sophon;
    } else if (hasStage2InPayload) {
      const bothIrrelevant =
        dto.stage1_classification === 'irrelevant' &&
        !suggestedProjectId &&
        !dto.llm_rationale;

      if (bothIrrelevant) {
        status = EmailTriageQueueStatus.irrelevant;
      } else if (suggestedProjectId || stage1ProjectId) {
        status = EmailTriageQueueStatus.pending_review;
      } else {
        status = EmailTriageQueueStatus.fetched;
      }
    } else {
      status = EmailTriageQueueStatus.fetched;
    }

    const stage1Data = {
      stage1Classification: dto.stage1_classification ?? null,
      stage1Model: dto.stage1_model ?? null,
      stage1Rationale: dto.stage1_rationale ?? null,
      stage1ProjectId,
    };

    const stage2Data = {
      suggestedProjectId,
      llmModel: dto.llm_model ?? null,
      llmRationale: dto.llm_rationale ?? null,
    };

    const row = await this.prisma.emailTriageQueue.upsert({
      where: { sourceUid: dto.source_uid },
      create: {
        sourceUid: dto.source_uid,
        mailbox: dto.mailbox ?? null,
        fromEmail: dto.from,
        toEmail: dto.to,
        subject: dto.subject,
        bodyText: dto.body ?? null,
        receivedAt: new Date(dto.date),
        ...stage1Data,
        ...stage2Data,
        status,
      },
      update: {
        mailbox: dto.mailbox ?? undefined,
        fromEmail: dto.from,
        toEmail: dto.to,
        subject: dto.subject,
        bodyText: dto.body ?? undefined,
        receivedAt: new Date(dto.date),
        ...stage1Data,
        ...stage2Data,
        status,
      },
      include: {
        stage1Project: { select: { id: true, name: true } },
        suggestedProject: { select: { id: true, name: true } },
        resolvedProject: { select: { id: true, name: true } },
      },
    });

    return row;
  }

  async listTriageQueue(status?: EmailTriageQueueStatus) {
    return this.prisma.emailTriageQueue.findMany({
      where: status ? { status } : undefined,
      orderBy: { receivedAt: 'desc' },
      include: {
        stage1Project: { select: { id: true, name: true } },
        suggestedProject: { select: { id: true, name: true } },
        resolvedProject: { select: { id: true, name: true } },
        task: { select: { id: true, shortId: true, title: true } },
      },
      take: 500,
    });
  }

  async reviewTriage(id: string, dto: TriageReviewDto, userId?: string | null) {
    const row = await this.prisma.emailTriageQueue.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Triage row not found');
    if (
      row.status === EmailTriageQueueStatus.approved ||
      row.status === EmailTriageQueueStatus.rejected
    ) {
      throw new BadRequestException('This triage row is already finalized');
    }

    const includeRelations = {
      stage1Project: { select: { id: true, name: true } },
      suggestedProject: { select: { id: true, name: true } },
      resolvedProject: { select: { id: true, name: true } },
      task: { select: { id: true, shortId: true, title: true } },
    };

    /** GPT cron: egyértelmű → task vagy irreleváns; bizonytalan → ember */
    if (dto.action === 'sophon_resolve') {
      if (
        row.status !== EmailTriageQueueStatus.awaiting_sophon &&
        row.status !== EmailTriageQueueStatus.fetched
      ) {
        throw new BadRequestException(
          'sophon_resolve: csak awaiting_sophon vagy fetched soron',
        );
      }
      if (
        !dto.sophon_outcome ||
        !dto.llm_model?.trim() ||
        dto.llm_rationale === undefined ||
        dto.llm_rationale === null
      ) {
        throw new BadRequestException(
          'sophon_resolve: sophon_outcome, llm_model és llm_rationale kötelező',
        );
      }

      const llmModel = dto.llm_model.trim();
      const llmRationale = String(dto.llm_rationale);

      if (dto.sophon_outcome === 'mark_irrelevant') {
        return this.prisma.emailTriageQueue.update({
          where: { id },
          data: {
            status: EmailTriageQueueStatus.irrelevant,
            llmModel,
            llmRationale,
            suggestedProjectId: null,
          },
          include: includeRelations,
        });
      }

      if (dto.sophon_outcome === 'needs_human') {
        let hintId: string | null = null;
        if (dto.resolved_project_id) {
          const p = await this.prisma.project.findUnique({
            where: { id: dto.resolved_project_id },
          });
          if (p) hintId = p.id;
        }
        return this.prisma.emailTriageQueue.update({
          where: { id },
          data: {
            status: EmailTriageQueueStatus.pending_review,
            llmModel,
            llmRationale,
            ...(hintId != null ? { suggestedProjectId: hintId } : {}),
          },
          include: includeRelations,
        });
      }

      // create_task
      const projectId =
        dto.resolved_project_id ||
        row.suggestedProjectId ||
        row.stage1ProjectId;
      if (!projectId) {
        throw new BadRequestException(
          'sophon create_task: nincs projekt (adj meg resolved_project_id vagy legyen Stage1 javaslat)',
        );
      }
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
      });
      if (!project) throw new BadRequestException('Érvénytelen projekt');

      return this.prisma.$transaction(async (tx) => {
        await tx.emailTriageQueue.update({
          where: { id },
          data: {
            llmModel,
            llmRationale,
            suggestedProjectId: projectId,
          },
        });

        const email = await tx.emailMessage.upsert({
          where: { sourceUid: row.sourceUid },
          update: {
            from: row.fromEmail,
            to: row.toEmail,
            subject: row.subject,
            date: row.receivedAt,
            body: row.bodyText,
          },
          create: {
            from: row.fromEmail,
            to: row.toEmail,
            subject: row.subject,
            date: row.receivedAt,
            body: row.bodyText,
            sourceUid: row.sourceUid,
          },
        });

        const task = await tx.task.create({
          data: {
            projectId,
            title: row.subject,
            description: row.bodyText?.slice(0, 2000) ?? undefined,
            sourceType: TaskSourceType.email,
            sourceRef: row.sourceUid,
          },
        });

        await tx.emailTaskLink.create({
          data: { emailId: email.id, taskId: task.id },
        });

        return tx.emailTriageQueue.update({
          where: { id },
          data: {
            status: EmailTriageQueueStatus.approved,
            taskId: task.id,
            resolvedProjectId: projectId,
            reviewedAt: new Date(),
          },
          include: includeRelations,
        });
      });
    }

    if (dto.action === 'reject') {
      return this.prisma.emailTriageQueue.update({
        where: { id },
        data: {
          status: EmailTriageQueueStatus.rejected,
          correctionReason: dto.correction_reason ?? null,
          reviewedByUserId: userId ?? null,
          reviewedAt: new Date(),
        },
        include: includeRelations,
      });
    }

    if (dto.action === 'set_project') {
      if (!dto.resolved_project_id) {
        throw new BadRequestException('resolved_project_id required');
      }
      const p = await this.prisma.project.findUnique({
        where: { id: dto.resolved_project_id },
      });
      if (!p) throw new BadRequestException('Invalid project');
      return this.prisma.emailTriageQueue.update({
        where: { id },
        data: {
          resolvedProjectId: p.id,
          correctionReason: dto.correction_reason ?? undefined,
          status: EmailTriageQueueStatus.pending_review,
        },
        include: includeRelations,
      });
    }

    // approve
    const projectId =
      dto.resolved_project_id ||
      row.resolvedProjectId ||
      row.suggestedProjectId ||
      row.stage1ProjectId;
    if (!projectId) {
      throw new BadRequestException(
        'No project: set resolved project or ensure LLM/suggestion exists',
      );
    }
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new BadRequestException('Invalid project');

    return this.prisma.$transaction(async (tx) => {
      const email = await tx.emailMessage.upsert({
        where: { sourceUid: row.sourceUid },
        update: {
          from: row.fromEmail,
          to: row.toEmail,
          subject: row.subject,
          date: row.receivedAt,
          body: row.bodyText,
        },
        create: {
          from: row.fromEmail,
          to: row.toEmail,
          subject: row.subject,
          date: row.receivedAt,
          body: row.bodyText,
          sourceUid: row.sourceUid,
        },
      });

      const task = await tx.task.create({
        data: {
          projectId,
          title: row.subject,
          description: row.bodyText?.slice(0, 2000) ?? undefined,
          sourceType: TaskSourceType.email,
          sourceRef: row.sourceUid,
        },
      });

      await tx.emailTaskLink.create({
        data: { emailId: email.id, taskId: task.id },
      });

      return tx.emailTriageQueue.update({
        where: { id },
        data: {
          status: EmailTriageQueueStatus.approved,
          taskId: task.id,
          resolvedProjectId: projectId,
          correctionReason: dto.correction_reason ?? undefined,
          reviewedByUserId: userId ?? null,
          reviewedAt: new Date(),
        },
        include: includeRelations,
      });
    });
  }

  async listTriageRules() {
    return this.prisma.triageRoutingRule.findMany({
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      include: { project: { select: { id: true, name: true } } },
    });
  }

  async createTriageRule(dto: TriageRuleCreateDto, userId?: string | null) {
    if (!TRIAGE_RULE_KINDS.has(dto.kind)) {
      throw new BadRequestException(
        `Invalid kind. Use: ${[...TRIAGE_RULE_KINDS].join(', ')}`,
      );
    }
    const p = await this.prisma.project.findUnique({
      where: { id: dto.project_id },
    });
    if (!p) throw new BadRequestException('Invalid project_id');

    return this.prisma.triageRoutingRule.create({
      data: {
        kind: dto.kind,
        pattern: dto.pattern,
        projectId: dto.project_id,
        priority: dto.priority ?? 100,
        name: dto.name ?? null,
        createdFromTriageId: dto.created_from_triage_id ?? null,
        createdByUserId: userId ?? null,
      },
      include: { project: { select: { id: true, name: true } } },
    });
  }

  async patchTriageRule(id: string, dto: TriageRulePatchDto) {
    const existing = await this.prisma.triageRoutingRule.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Rule not found');
    if (dto.kind && !TRIAGE_RULE_KINDS.has(dto.kind)) {
      throw new BadRequestException(
        `Invalid kind. Use: ${[...TRIAGE_RULE_KINDS].join(', ')}`,
      );
    }
    if (dto.project_id) {
      const p = await this.prisma.project.findUnique({
        where: { id: dto.project_id },
      });
      if (!p) throw new BadRequestException('Invalid project_id');
    }

    return this.prisma.triageRoutingRule.update({
      where: { id },
      data: {
        kind: dto.kind ?? undefined,
        pattern: dto.pattern ?? undefined,
        projectId: dto.project_id ?? undefined,
        priority: dto.priority ?? undefined,
        enabled: dto.enabled ?? undefined,
        name: dto.name ?? undefined,
      },
      include: { project: { select: { id: true, name: true } } },
    });
  }

  async deleteTriageRule(id: string) {
    await this.prisma.triageRoutingRule.delete({ where: { id } });
    return { ok: true };
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
          contactEmails.map((e) => e.split('@')[1]).filter(Boolean),
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

  /**
   * Full context for Sophon Stage 2: projects + KB summaries + rules + recent corrections.
   * Designed to be included in the OpenAI prompt for better classification.
   */
  async getTriageContext() {
    const [projects, rules, recentCorrections, awaitingSophon] =
      await Promise.all([
      this.prisma.project.findMany({
        select: {
          id: true,
          name: true,
          description: true,
          knowledgeBase: true,
          contacts: {
            select: { name: true, email: true, company: true },
            take: 10,
          },
        },
        orderBy: { priority: 'desc' },
      }),
      this.prisma.triageRoutingRule.findMany({
        where: { enabled: true },
        orderBy: { priority: 'asc' },
        select: { kind: true, pattern: true, projectId: true, name: true },
      }),
      this.prisma.emailTriageQueue.findMany({
        where: {
          correctionReason: { not: null },
          status: { in: ['approved', 'rejected'] },
        },
        orderBy: { reviewedAt: 'desc' },
        take: 30,
        select: {
          fromEmail: true,
          subject: true,
          stage1Classification: true,
          suggestedProjectId: true,
          resolvedProjectId: true,
          correctionReason: true,
          resolvedProject: { select: { id: true, name: true } },
          suggestedProject: { select: { id: true, name: true } },
        },
      }),
      this.prisma.emailTriageQueue.findMany({
        where: { status: EmailTriageQueueStatus.awaiting_sophon },
        orderBy: { receivedAt: 'asc' },
        take: 100,
        select: {
          id: true,
          sourceUid: true,
          fromEmail: true,
          subject: true,
          bodyText: true,
          receivedAt: true,
          stage1Classification: true,
          stage1Model: true,
          stage1Rationale: true,
          stage1ProjectId: true,
          stage1Project: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        kbSummary: p.knowledgeBase?.slice(0, 1500) ?? null,
        contacts: p.contacts,
      })),
      rules,
      recentCorrections,
      awaitingSophonQueue: awaitingSophon.map((r) => ({
        id: r.id,
        sourceUid: r.sourceUid,
        fromEmail: r.fromEmail,
        subject: r.subject,
        bodyPreview: r.bodyText?.slice(0, 4000) ?? null,
        receivedAt: r.receivedAt,
        stage1Classification: r.stage1Classification,
        stage1Model: r.stage1Model,
        stage1Rationale: r.stage1Rationale,
        stage1ProjectId: r.stage1ProjectId,
        stage1Project: r.stage1Project,
      })),
    };
  }

  /** Flat list for Sophon / imap script — same order as server-side intake. */
  async getTriageRulesForAgent() {
    return this.prisma.triageRoutingRule.findMany({
      where: { enabled: true },
      orderBy: { priority: 'asc' },
      select: {
        id: true,
        kind: true,
        pattern: true,
        projectId: true,
        priority: true,
        name: true,
      },
    });
  }
}
