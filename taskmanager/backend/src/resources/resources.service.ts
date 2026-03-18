import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';

const OPENCLAW_ROOT = process.env.OPENCLAW_DATA_PATH || '/data/openclaw';

export interface CronRunEntry {
  ts: number;
  jobId: string;
  action: string;
  status: string;
  summary?: string;
  model?: string;
  provider?: string;
  durationMs?: number;
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
  sessionId?: string;
  delivered?: boolean;
}

const PLAN_LIMITS: Record<string, {
  label: string;
  dailyTasks: number;
  concurrentTasks: number;
  timeoutMinutes: number;
  maxFiles: number;
  monthlyCostUsd: number;
}> = {
  free:       { label: 'Free',       dailyTasks: 5,    concurrentTasks: 1, timeoutMinutes: 5,  maxFiles: 10,  monthlyCostUsd: 0 },
  plus:       { label: 'Plus',       dailyTasks: 25,   concurrentTasks: 1, timeoutMinutes: 10, maxFiles: 50,  monthlyCostUsd: 20 },
  pro:        { label: 'Pro',        dailyTasks: 250,  concurrentTasks: 3, timeoutMinutes: 30, maxFiles: 200, monthlyCostUsd: 200 },
  max:        { label: 'Max',        dailyTasks: 1000, concurrentTasks: 5, timeoutMinutes: 60, maxFiles: 500, monthlyCostUsd: 200 },
  business:   { label: 'Business',   dailyTasks: 100,  concurrentTasks: 2, timeoutMinutes: 15, maxFiles: 100, monthlyCostUsd: 25 },
  enterprise: { label: 'Enterprise', dailyTasks: 9999, concurrentTasks: 10, timeoutMinutes: 60, maxFiles: 999, monthlyCostUsd: 0 },
};

const TOKEN_PRICING = {
  'gpt-5.3-codex': { inputPer1M: 2.0, outputPer1M: 10.0 },
  'gpt-5-nano':    { inputPer1M: 0.10, outputPer1M: 0.40 },
  'default':       { inputPer1M: 2.0, outputPer1M: 10.0 },
};

@Injectable()
export class ResourcesService implements OnModuleInit {
  private readonly logger = new Logger(ResourcesService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    this.getCronHistory(30)
      .then(() => this.logger.log('Cron history cache warmed'))
      .catch(() => this.logger.warn('Cron history cache warm failed'));
  }

  private getPlan(): string {
    return process.env.OPENCLAW_PLAN || 'plus';
  }

  private getModelPricing(model: string) {
    const shortName = model.split('/').pop() || 'default';
    return TOKEN_PRICING[shortName as keyof typeof TOKEN_PRICING] || TOKEN_PRICING.default;
  }

  async getConfig() {
    try {
      const raw = await fs.readFile(path.join(OPENCLAW_ROOT, 'openclaw.json'), 'utf-8');
      const config = JSON.parse(raw);

      const authProfiles = Object.entries(config.auth?.profiles || {}).map(([id, p]: [string, any]) => ({
        id,
        provider: p.provider,
        mode: p.mode,
      }));

      const agents = (config.agents?.list || []).map((a: any) => ({
        id: a.id,
        name: a.name || a.id,
        identity: a.identity,
        model: a.model?.primary || config.agents?.defaults?.model?.primary || 'unknown',
        fallbacks: a.model?.fallbacks || config.agents?.defaults?.model?.fallbacks || [],
        sandbox: a.sandbox?.mode || config.agents?.defaults?.sandbox?.mode || 'off',
      }));

      const defaults = {
        model: config.agents?.defaults?.model?.primary || 'unknown',
        fallbacks: config.agents?.defaults?.model?.fallbacks || [],
        maxConcurrentSubagents: config.agents?.defaults?.subagents?.maxConcurrent || 8,
        maxSpawnDepth: config.agents?.defaults?.subagents?.maxSpawnDepth || 2,
        heartbeat: config.agents?.defaults?.heartbeat?.every || '0m',
      };

      const cron = {
        enabled: config.cron?.enabled ?? false,
        maxConcurrentRuns: config.cron?.maxConcurrentRuns || 1,
      };

      return { authProfiles, agents, defaults, cron };
    } catch {
      return { authProfiles: [], agents: [], defaults: {}, cron: {} };
    }
  }

  private get cronJobsPath() {
    return path.join(OPENCLAW_ROOT, 'cron/jobs.json');
  }

  private async readCronStore(): Promise<{ version: number; jobs: any[] }> {
    try {
      const raw = await fs.readFile(this.cronJobsPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return { version: 1, jobs: [] };
    }
  }

  private async writeCronStore(store: { version: number; jobs: any[] }) {
    await fs.writeFile(this.cronJobsPath, JSON.stringify(store, null, 2), 'utf-8');
  }

  async getCronJobs() {
    const data = await this.readCronStore();
    return (data.jobs || []).map((j: any) => ({
      id: j.id,
      name: j.name || j.id,
      description: j.description,
      enabled: j.enabled,
      schedule: j.schedule,
      sessionTarget: j.sessionTarget,
      payload: j.payload,
      state: j.state || {},
      delivery: j.delivery,
      agentId: j.agentId,
      createdAtMs: j.createdAtMs,
      updatedAtMs: j.updatedAtMs,
    }));
  }

  async getCronJob(jobId: string) {
    const data = await this.readCronStore();
    const job = data.jobs.find((j: any) => j.id === jobId);
    if (!job) return null;
    return job;
  }

  async updateCronJob(jobId: string, patch: Record<string, any>) {
    const store = await this.readCronStore();
    const idx = store.jobs.findIndex((j: any) => j.id === jobId);
    if (idx === -1) return null;

    const job = store.jobs[idx];
    if (patch.name !== undefined) job.name = patch.name;
    if (patch.enabled !== undefined) job.enabled = patch.enabled;
    if (patch.schedule !== undefined) job.schedule = patch.schedule;
    if (patch.payload !== undefined) job.payload = patch.payload;
    if (patch.delivery !== undefined) job.delivery = patch.delivery;
    if (patch.sessionTarget !== undefined) job.sessionTarget = patch.sessionTarget;
    if (patch.wakeMode !== undefined) job.wakeMode = patch.wakeMode;
    if (patch.agentId !== undefined) job.agentId = patch.agentId;
    job.updatedAtMs = Date.now();

    store.jobs[idx] = job;
    await this.writeCronStore(store);
    return job;
  }

  async addCronJob(jobData: Record<string, any>) {
    const store = await this.readCronStore();
    const id = crypto.randomUUID();
    const now = Date.now();
    const job = {
      id,
      ...jobData,
      createdAtMs: now,
      updatedAtMs: now,
      state: {},
    };
    store.jobs.push(job);
    await this.writeCronStore(store);
    return job;
  }

  async removeCronJob(jobId: string) {
    const store = await this.readCronStore();
    const idx = store.jobs.findIndex((j: any) => j.id === jobId);
    if (idx === -1) return null;

    const removed = store.jobs.splice(idx, 1)[0];
    await this.writeCronStore(store);
    return removed;
  }

  async toggleCronJob(jobId: string, enabled: boolean) {
    return this.updateCronJob(jobId, { enabled });
  }

  private cronHistoryCache: { data: CronRunEntry[]; ts: number; days: number } | null = null;
  private readonly CRON_CACHE_TTL = 300_000;

  async getCronHistory(days = 14) {
    if (
      this.cronHistoryCache &&
      this.cronHistoryCache.days >= days &&
      Date.now() - this.cronHistoryCache.ts < this.CRON_CACHE_TTL
    ) {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      return this.cronHistoryCache.data.filter(r => r.ts >= cutoff);
    }

    const runsDir = path.join(OPENCLAW_ROOT, 'cron/runs');
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    try {
      const files = await fs.readdir(runsDir);
      const allRuns: CronRunEntry[] = [];

      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;
        try {
          const content = await fs.readFile(path.join(runsDir, file), 'utf-8');
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
      const result = allRuns.slice(0, 500);
      this.cronHistoryCache = { data: result, ts: Date.now(), days };
      return result;
    } catch {
      return [];
    }
  }

  async getDailyUsage(days = 14) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const cronRuns = await this.getCronHistory(days);

    const dailyMap = new Map<string, {
      date: string;
      cronRuns: number;
      cronErrors: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      totalDurationMs: number;
      agentActions: number;
      taskCreates: number;
      statusChanges: number;
      costUsd: number;
    }>();

    const ensureDay = (dateStr: string) => {
      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, {
          date: dateStr,
          cronRuns: 0,
          cronErrors: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          totalDurationMs: 0,
          agentActions: 0,
          taskCreates: 0,
          statusChanges: 0,
          costUsd: 0,
        });
      }
      return dailyMap.get(dateStr)!;
    };

    for (const run of cronRuns) {
      const dateStr = new Date(run.ts).toISOString().slice(0, 10);
      const day = ensureDay(dateStr);
      day.cronRuns++;
      if (run.status !== 'ok') day.cronErrors++;
      if (run.usage) {
        const inp = run.usage.input_tokens || 0;
        const out = run.usage.output_tokens || 0;
        day.inputTokens += inp;
        day.outputTokens += out;
        day.totalTokens += run.usage.total_tokens || 0;

        const pricing = this.getModelPricing(run.model || '');
        day.costUsd += (inp / 1_000_000) * pricing.inputPer1M + (out / 1_000_000) * pricing.outputPer1M;
      }
      day.totalDurationMs += run.durationMs || 0;
    }

    const dailyDbStats = await this.prisma.$queryRaw<
      { day: string; action_type: string; count: string }[]
    >`
      SELECT DATE(created_at)::text as day, action_type, COUNT(*)::text as count
      FROM agent_actions
      WHERE created_at >= ${new Date(cutoff)}
      GROUP BY day, action_type
      ORDER BY day DESC
    `;

    for (const row of dailyDbStats) {
      const day = ensureDay(row.day);
      const cnt = parseInt(row.count, 10);
      day.agentActions += cnt;
      if (row.action_type === 'create') day.taskCreates += cnt;
      if (row.action_type === 'status_change') day.statusChanges += cnt;
    }

    const result = Array.from(dailyMap.values());
    result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  }

  async getSummary() {
    const [config, jobs, dailyUsage] = await Promise.all([
      this.getConfig(),
      this.getCronJobs(),
      this.getDailyUsage(14),
    ]);

    const totalTokens = dailyUsage.reduce((s, d) => s + d.totalTokens, 0);
    const totalInputTokens = dailyUsage.reduce((s, d) => s + d.inputTokens, 0);
    const totalOutputTokens = dailyUsage.reduce((s, d) => s + d.outputTokens, 0);
    const totalCronRuns = dailyUsage.reduce((s, d) => s + d.cronRuns, 0);
    const totalErrors = dailyUsage.reduce((s, d) => s + d.cronErrors, 0);
    const totalAgentActions = dailyUsage.reduce((s, d) => s + d.agentActions, 0);
    const totalCostUsd = dailyUsage.reduce((s, d) => s + d.costUsd, 0);
    const enabledJobs = jobs.filter((j: any) => j.enabled).length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayData = dailyUsage.find(d => d.date === todayStr);

    const planKey = this.getPlan();
    const plan = PLAN_LIMITS[planKey] || PLAN_LIMITS.plus;

    const enabledJobSchedules = jobs.filter((j: any) => j.enabled).map((j: any) => j.schedule);
    let expectedRunsPerDay = 0;
    for (const sched of enabledJobSchedules) {
      if (sched?.expr) {
        const match = sched.expr.match(/\*\/(\d+)/);
        if (match) {
          expectedRunsPerDay += Math.floor(24 / parseInt(match[1], 10));
        }
      } else if (sched?.everyMs) {
        expectedRunsPerDay += Math.floor(86400000 / sched.everyMs);
      }
    }

    const avgTokensPerRun = totalCronRuns > 0 ? Math.round(totalTokens / totalCronRuns) : 0;
    const avgCostPerRun = totalCronRuns > 0 ? totalCostUsd / totalCronRuns : 0;

    return {
      config,
      jobs,
      dailyUsage,
      plan: {
        key: planKey,
        ...plan,
        expectedRunsPerDay,
      },
      pricing: TOKEN_PRICING,
      today: {
        date: todayStr,
        cronRuns: todayData?.cronRuns || 0,
        cronErrors: todayData?.cronErrors || 0,
        totalTokens: todayData?.totalTokens || 0,
        inputTokens: todayData?.inputTokens || 0,
        outputTokens: todayData?.outputTokens || 0,
        costUsd: todayData?.costUsd || 0,
        totalDurationMs: todayData?.totalDurationMs || 0,
        taskLimitUsed: todayData?.cronRuns || 0,
        taskLimitMax: plan.dailyTasks,
        taskLimitPct: Math.round(((todayData?.cronRuns || 0) / plan.dailyTasks) * 100),
      },
      totals: {
        tokens: totalTokens,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cronRuns: totalCronRuns,
        cronErrors: totalErrors,
        agentActions: totalAgentActions,
        costUsd: Math.round(totalCostUsd * 100) / 100,
        enabledJobs,
        totalJobs: jobs.length,
        daysTracked: dailyUsage.length,
        avgTokensPerRun,
        avgCostPerRun: Math.round(avgCostPerRun * 1000) / 1000,
      },
    };
  }

  async getQuotaStatus(): Promise<any> {
    try {
      const quotaFile = path.join(OPENCLAW_ROOT, 'quota-status.json');
      const raw = await fs.readFile(quotaFile, 'utf8');
      return JSON.parse(raw);
    } catch {
      return {
        provider: 'unknown',
        hourly: { pctLeft: -1, resetIn: 'unknown' },
        weekly: { pctLeft: -1, resetIn: 'unknown' },
        rateLimited: false,
        ts: 0,
        error: 'quota-status.json not found',
      };
    }
  }
}
