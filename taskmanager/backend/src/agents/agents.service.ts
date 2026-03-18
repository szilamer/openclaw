import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';

const OPENCLAW_ROOT = process.env.OPENCLAW_DATA_PATH || '/data/openclaw';

const INPUT_COST_PER_1M = 2;
const OUTPUT_COST_PER_1M = 10;

interface CronRunEntry {
  ts: number;
  jobId: string;
  action: string;
  status: string;
  summary?: string;
  model?: string;
  provider?: string;
  durationMs?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

interface CronJobEntry {
  id: string;
  name?: string;
  enabled?: boolean;
  schedule?: any;
  agentId?: string;
  state?: any;
  payload?: any;
  description?: string;
}

export interface AgentCurrentTask {
  id: string;
  shortId: number;
  title: string;
  liveStatus: string | null;
  liveStatusUpdatedAt: Date | null;
}

export interface AgentActiveTask {
  id: string;
  shortId: number;
  title: string;
  status: string;
  liveStatus: string | null;
}

export interface AgentStats {
  completedTasks: number;
  totalTasks: number;
  activeTasks: number;
  totalRuns: number;
  successfulRuns: number;
  successRate: number;
  totalTokens: number;
  totalCost: number;
  costPerTask: number;
  avgTokensPerRun: number;
  avgDurationMs: number;
  totalDurationMs: number;
}

export interface AgentCronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: any;
  lastStatus: string | null;
  lastRunAt: number | null;
  lastDurationMs: number | null;
}

export interface AgentInfo {
  id: string;
  name: string;
  identity: { name?: string; theme?: string; emoji?: string };
  model: string;
  fallbacks: string[];
  sandbox: string;
  workspace: string | null;
  subagents: any;
  currentTask: AgentCurrentTask | null;
  activeTasks: AgentActiveTask[];
  stats: AgentStats;
  cronJobs: AgentCronJob[];
}

export interface AgentsResponse {
  agents: AgentInfo[];
  defaults: {
    model: string;
    fallbacks: string[];
    heartbeat: string;
    maxConcurrent: number;
    budget: {
      dailyMaxUsd: number | null;
      warningThresholdPct: number;
      strategy: string;
      fallbackModel: string | null;
    };
  };
}

export interface ActivityEntry {
  type: 'comment' | 'cron_run';
  ts: number;
  [key: string]: any;
}

@Injectable()
export class AgentsService {
  constructor(private prisma: PrismaService) {}

  private async readBudgetConfig(): Promise<any> {
    try {
      const raw = await fs.readFile(
        path.join(OPENCLAW_ROOT, 'budget.json'),
        'utf-8',
      );
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private async writeBudgetConfig(budget: any): Promise<void> {
    await fs.writeFile(
      path.join(OPENCLAW_ROOT, 'budget.json'),
      JSON.stringify(budget, null, 2),
      'utf-8',
    );
  }

  private async readOpenclawConfig(): Promise<any> {
    const raw = await fs.readFile(
      path.join(OPENCLAW_ROOT, 'openclaw.json'),
      'utf-8',
    );
    return JSON.parse(raw);
  }

  private async readCronJobs(): Promise<CronJobEntry[]> {
    try {
      const raw = await fs.readFile(
        path.join(OPENCLAW_ROOT, 'cron/jobs.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      return data.jobs || [];
    } catch {
      return [];
    }
  }

  private async readCronRuns(days = 14): Promise<CronRunEntry[]> {
    const runsDir = path.join(OPENCLAW_ROOT, 'cron/runs');
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    try {
      const files = await fs.readdir(runsDir);
      const allRuns: CronRunEntry[] = [];

      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;
        try {
          const content = await fs.readFile(
            path.join(runsDir, file),
            'utf-8',
          );
          for (const line of content.split('\n')) {
            if (!line.trim()) continue;
            try {
              const entry = JSON.parse(line) as CronRunEntry;
              if (entry.ts >= cutoff && entry.action === 'finished') {
                allRuns.push(entry);
              }
            } catch { /* skip malformed lines */ }
          }
        } catch { /* skip unreadable files */ }
      }

      allRuns.sort((a, b) => b.ts - a.ts);
      return allRuns;
    } catch {
      return [];
    }
  }

  private computeCost(usage: CronRunEntry['usage']): number {
    if (!usage) return 0;
    return (
      (usage.input_tokens / 1_000_000) * INPUT_COST_PER_1M +
      (usage.output_tokens / 1_000_000) * OUTPUT_COST_PER_1M
    );
  }

  async getAgents(): Promise<AgentsResponse> {
    let config: any;
    try {
      config = await this.readOpenclawConfig();
    } catch {
      config = {};
    }

    const agentConfigs: any[] = config.agents?.list || [];
    const defaults = config.agents?.defaults || {};
    const cronJobs = await this.readCronJobs();
    const cronRuns = await this.readCronRuns(14);

    const agentUsers = await this.prisma.user.findMany({
      where: { role: 'agent' },
    });

    const agentUserIds = agentUsers.map((u) => u.id);
    const allTasks =
      agentUserIds.length > 0
        ? await this.prisma.task.findMany({
            where: { assigneeId: { in: agentUserIds } },
          })
        : [];

    const cronRunsByAgent = new Map<string, CronRunEntry[]>();
    for (const run of cronRuns) {
      const job = cronJobs.find((j) => j.id === run.jobId);
      const agentId = job?.agentId || 'sophon';
      if (!cronRunsByAgent.has(agentId)) cronRunsByAgent.set(agentId, []);
      cronRunsByAgent.get(agentId)!.push(run);
    }

    const agents: AgentInfo[] = agentConfigs.map((ac) => {
      const dbUser = agentUsers.find((u) =>
        u.name?.toLowerCase().includes(ac.id),
      );
      const tasks = dbUser
        ? allTasks.filter((t) => t.assigneeId === dbUser.id)
        : [];

      const completedTasks = tasks.filter((t) => t.status === 'Kész');
      const active = tasks.filter(
        (t) => t.status !== 'Kész' && t.status !== 'Beérkező',
      );
      const currentTaskRaw = tasks.find((t) => t.status === 'Folyamatban');

      const currentTask: AgentCurrentTask | null = currentTaskRaw
        ? {
            id: currentTaskRaw.id,
            shortId: currentTaskRaw.shortId,
            title: currentTaskRaw.title,
            liveStatus: currentTaskRaw.liveStatus,
            liveStatusUpdatedAt: currentTaskRaw.liveStatusUpdatedAt,
          }
        : null;

      const activeTasks: AgentActiveTask[] = active.map((t) => ({
        id: t.id,
        shortId: t.shortId,
        title: t.title,
        status: t.status,
        liveStatus: t.liveStatus,
      }));

      const runs = cronRunsByAgent.get(ac.id) || [];
      const successfulRuns = runs.filter((r) => r.status === 'ok');
      const totalTokens = runs.reduce(
        (sum, r) => sum + (r.usage?.total_tokens || 0),
        0,
      );
      const totalCost = runs.reduce((sum, r) => sum + this.computeCost(r.usage), 0);
      const totalDurationMs = runs.reduce(
        (sum, r) => sum + (r.durationMs || 0),
        0,
      );

      const agentCronJobs: AgentCronJob[] = cronJobs
        .filter((j) => (j.agentId || 'sophon') === ac.id)
        .map((j) => {
          const jobRuns = runs.filter((r) => r.jobId === j.id);
          const lastRun = jobRuns[0] || null;
          return {
            id: j.id,
            name: j.name || j.id,
            enabled: j.enabled ?? false,
            schedule: j.schedule,
            lastStatus: lastRun?.status ?? null,
            lastRunAt: lastRun?.ts ?? null,
            lastDurationMs: lastRun?.durationMs ?? null,
          };
        });

      const stats: AgentStats = {
        completedTasks: completedTasks.length,
        totalTasks: tasks.length,
        activeTasks: active.length,
        totalRuns: runs.length,
        successfulRuns: successfulRuns.length,
        successRate:
          runs.length > 0
            ? Math.round((successfulRuns.length / runs.length) * 100)
            : 0,
        totalTokens,
        totalCost: Math.round(totalCost * 100) / 100,
        costPerTask:
          completedTasks.length > 0
            ? Math.round((totalCost / completedTasks.length) * 100) / 100
            : 0,
        avgTokensPerRun:
          runs.length > 0 ? Math.round(totalTokens / runs.length) : 0,
        avgDurationMs:
          runs.length > 0 ? Math.round(totalDurationMs / runs.length) : 0,
        totalDurationMs,
      };

      return {
        id: ac.id,
        name: ac.name || ac.id,
        identity: ac.identity || {},
        model:
          ac.model?.primary || defaults.model?.primary || 'unknown',
        fallbacks:
          ac.model?.fallbacks || defaults.model?.fallbacks || [],
        sandbox: ac.sandbox?.mode || defaults.sandbox?.mode || 'off',
        workspace: ac.workspace || null,
        subagents: ac.subagents || defaults.subagents || {},
        currentTask,
        activeTasks,
        stats,
        cronJobs: agentCronJobs,
      };
    });

    const budget = await this.readBudgetConfig();

    return {
      agents,
      defaults: {
        model: defaults.model?.primary || 'unknown',
        fallbacks: defaults.model?.fallbacks || [],
        heartbeat: defaults.heartbeat?.every || '0m',
        maxConcurrent: defaults.subagents?.maxConcurrent || 8,
        budget: {
          dailyMaxUsd: budget.dailyMaxUsd ?? null,
          warningThresholdPct: budget.warningThresholdPct ?? 80,
          strategy: budget.strategy ?? 'fallback',
          fallbackModel: budget.fallbackModel ?? null,
        },
      },
    };
  }

  async getAgentActivity(
    agentId: string,
    limit = 50,
  ): Promise<ActivityEntry[]> {
    let config: any;
    try {
      config = await this.readOpenclawConfig();
    } catch {
      throw new NotFoundException(`Cannot read agent config`);
    }

    const agentConfigs: any[] = config.agents?.list || [];
    const agentConfig = agentConfigs.find((a) => a.id === agentId);
    if (!agentConfig) {
      throw new NotFoundException(`Agent "${agentId}" not found`);
    }

    const dbUser = await this.prisma.user.findFirst({
      where: {
        role: 'agent',
        name: { contains: agentId, mode: 'insensitive' },
      },
    });

    const timeline: ActivityEntry[] = [];

    if (dbUser) {
      const comments = await this.prisma.taskComment.findMany({
        where: { userId: dbUser.id },
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          task: { select: { shortId: true, title: true, status: true } },
        },
      });

      for (const c of comments) {
        timeline.push({
          type: 'comment',
          ts: c.createdAt.getTime(),
          commentId: c.id,
          taskId: c.taskId,
          taskShortId: c.task.shortId,
          taskTitle: c.task.title,
          taskStatus: c.task.status,
          content: c.content,
        });
      }
    }

    const cronJobs = await this.readCronJobs();
    const agentJobIds = cronJobs
      .filter((j) => (j.agentId || 'sophon') === agentId)
      .map((j) => j.id);

    if (agentJobIds.length > 0) {
      const runs = await this.readCronRuns(14);
      for (const run of runs) {
        if (!agentJobIds.includes(run.jobId)) continue;
        timeline.push({
          type: 'cron_run',
          ts: run.ts,
          jobId: run.jobId,
          status: run.status,
          summary: run.summary || null,
          model: run.model || null,
          durationMs: run.durationMs || null,
          tokens: run.usage?.total_tokens || null,
        });
      }
    }

    timeline.sort((a, b) => b.ts - a.ts);
    return timeline.slice(0, limit);
  }

  private async readAgentModelsJson(): Promise<
    { id: string; provider: string; name: string; hasApiKey: boolean }[]
  > {
    const results: { id: string; provider: string; name: string; hasApiKey: boolean }[] = [];
    const seen = new Set<string>();

    const agentsDir = path.join(OPENCLAW_ROOT, 'agents');
    let agentDirs: string[] = [];
    try {
      agentDirs = await fs.readdir(agentsDir);
    } catch {
      return results;
    }

    for (const dir of agentDirs) {
      const modelsPath = path.join(agentsDir, dir, 'agent', 'models.json');
      try {
        const raw = await fs.readFile(modelsPath, 'utf-8');
        const data = JSON.parse(raw);
        const providers = data.providers || {};
        for (const [providerId, providerData] of Object.entries(providers) as [
          string,
          any,
        ][]) {
          const hasApiKey = !!(providerData?.apiKey?.trim());
          const models = providerData?.models || [];
          for (const m of models) {
            const modelId = m.id || '';
            const fullId = `${providerId}/${modelId}`;
            if (!modelId || seen.has(fullId)) continue;
            seen.add(fullId);
            results.push({
              id: fullId,
              provider: providerId,
              name: m.name || modelId,
              hasApiKey,
            });
          }
        }
      } catch {
        continue;
      }
    }

    return results;
  }

  async getAvailableModels(): Promise<{
    models: {
      id: string;
      provider: string;
      name: string;
      tier: 'subscription' | 'api';
      hasApiKey: boolean;
    }[];
  }> {
    let config: any;
    try {
      config = await this.readOpenclawConfig();
    } catch {
      config = {};
    }

    const catalogModels = await this.readAgentModelsJson();

    const oauthProviders = new Set<string>();
    const profiles = config.auth?.profiles || {};
    for (const [, profile] of Object.entries(profiles) as [string, any][]) {
      if (profile?.mode === 'oauth' && profile?.provider) {
        oauthProviders.add(profile.provider);
      }
    }

    const models = catalogModels.map((m) => ({
      id: m.id,
      provider: m.provider,
      name: m.name,
      tier: oauthProviders.has(m.provider) ? 'subscription' as const : 'api' as const,
      hasApiKey: m.hasApiKey || oauthProviders.has(m.provider),
    }));

    const seen = new Set(models.map((m) => m.id));

    const defaults = config.agents?.defaults || {};
    const primaryModel = defaults.model?.primary;
    if (primaryModel && !seen.has(primaryModel)) {
      seen.add(primaryModel);
      const parts = primaryModel.split('/');
      models.push({
        id: primaryModel,
        provider: parts[0],
        name: parts.slice(1).join('/'),
        tier: oauthProviders.has(parts[0]) ? 'subscription' : 'api',
        hasApiKey: true,
      });
    }
    for (const fb of defaults.model?.fallbacks || []) {
      if (fb && !seen.has(fb)) {
        seen.add(fb);
        const parts = fb.split('/');
        models.push({
          id: fb,
          provider: parts[0],
          name: parts.slice(1).join('/'),
          tier: oauthProviders.has(parts[0]) ? 'subscription' : 'api',
          hasApiKey: true,
        });
      }
    }

    models.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier === 'subscription' ? -1 : 1;
      return a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name);
    });

    return { models };
  }

  async updateBudget(dto: {
    dailyMaxUsd?: number | null;
    warningThresholdPct?: number;
    strategy?: string;
    fallbackModel?: string | null;
  }) {
    const budget = await this.readBudgetConfig();

    if (dto.dailyMaxUsd !== undefined) {
      budget.dailyMaxUsd = dto.dailyMaxUsd;
    }
    if (dto.warningThresholdPct !== undefined) {
      budget.warningThresholdPct = dto.warningThresholdPct;
    }
    if (dto.strategy !== undefined) {
      budget.strategy = dto.strategy;
    }
    if (dto.fallbackModel !== undefined) {
      budget.fallbackModel = dto.fallbackModel;
    }

    await this.writeBudgetConfig(budget);

    if (dto.fallbackModel !== undefined) {
      try {
        const config = await this.readOpenclawConfig();
        if (!config.agents) config.agents = {};
        if (!config.agents.defaults) config.agents.defaults = {};
        if (!config.agents.defaults.model)
          config.agents.defaults.model = {};
        config.agents.defaults.model.fallbacks = dto.fallbackModel
          ? [dto.fallbackModel]
          : [];
        await fs.writeFile(
          path.join(OPENCLAW_ROOT, 'openclaw.json'),
          JSON.stringify(config, null, 2),
          'utf-8',
        );
      } catch {
        // Non-critical: budget.json is the source of truth
      }
    }

    return budget;
  }

  async createAgent(dto: {
    id: string;
    name: string;
    theme?: string;
    emoji?: string;
    model?: string;
  }) {
    if (!dto.id || !dto.name) {
      throw new BadRequestException('id and name are required');
    }
    if (!/^[a-z][a-z0-9-]*$/.test(dto.id)) {
      throw new BadRequestException(
        'id must start with a lowercase letter and contain only lowercase letters, digits, and hyphens',
      );
    }

    let config: any;
    try {
      config = await this.readOpenclawConfig();
    } catch {
      throw new BadRequestException('Cannot read openclaw.json');
    }

    const agentsList: any[] = config.agents?.list || [];
    if (agentsList.find((a) => a.id === dto.id)) {
      throw new BadRequestException(`Agent "${dto.id}" already exists`);
    }

    const newAgent: any = {
      id: dto.id,
      name: dto.name,
      identity: {
        name: dto.name,
        theme: dto.theme || 'default',
        emoji: dto.emoji || '🤖',
      },
    };
    if (dto.model) {
      newAgent.model = { primary: dto.model };
    }

    if (!config.agents) config.agents = {};
    if (!config.agents.list) config.agents.list = [];
    config.agents.list.push(newAgent);

    await fs.writeFile(
      path.join(OPENCLAW_ROOT, 'openclaw.json'),
      JSON.stringify(config, null, 2),
      'utf-8',
    );

    const user = await this.prisma.user.create({
      data: {
        name: `${dto.name} Agent`,
        email: `${dto.id}@agent.openclaw`,
        role: 'agent',
        passwordHash: 'agent-no-login',
      },
    });

    return { agent: newAgent, userId: user.id };
  }

  async updateAgent(
    agentId: string,
    dto: {
      name?: string;
      model?: string;
      fallbacks?: string[];
      theme?: string;
      emoji?: string;
    },
  ) {
    let config: any;
    try {
      config = await this.readOpenclawConfig();
    } catch {
      throw new NotFoundException('Cannot read openclaw.json');
    }

    const agentsList: any[] = config.agents?.list || [];
    const idx = agentsList.findIndex((a) => a.id === agentId);
    if (idx === -1) {
      throw new NotFoundException(`Agent "${agentId}" not found`);
    }

    const agent = agentsList[idx];
    if (dto.name !== undefined) {
      agent.name = dto.name;
      if (agent.identity) agent.identity.name = dto.name;
    }
    if (dto.model !== undefined) {
      if (!agent.model) agent.model = {};
      agent.model.primary = dto.model;
    }
    if (dto.fallbacks !== undefined) {
      if (!agent.model) agent.model = {};
      agent.model.fallbacks = dto.fallbacks;
    }
    if (dto.theme !== undefined) {
      if (!agent.identity) agent.identity = {};
      agent.identity.theme = dto.theme;
    }
    if (dto.emoji !== undefined) {
      if (!agent.identity) agent.identity = {};
      agent.identity.emoji = dto.emoji;
    }

    config.agents.list[idx] = agent;

    await fs.writeFile(
      path.join(OPENCLAW_ROOT, 'openclaw.json'),
      JSON.stringify(config, null, 2),
      'utf-8',
    );

    return agent;
  }
}
