import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AgentTokenGuard } from '../auth/agent-token.guard';
import { AgentsService } from '../agents/agents.service';
import { ResourcesService } from './resources.service';

@ApiTags('resources')
@ApiBearerAuth('agent-token')
@Controller('resources')
@UseGuards(AgentTokenGuard)
export class ResourcesController {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly agentsService: AgentsService,
  ) {}

  @Get('summary')
  getSummary() {
    return this.resourcesService.getSummary();
  }

  @Get('config')
  getConfig() {
    return this.resourcesService.getConfig();
  }

  @Get('quota')
  getQuotaStatus() {
    return this.resourcesService.getQuotaStatus();
  }

  @Get('cron-jobs')
  getCronJobs() {
    return this.resourcesService.getCronJobs();
  }

  @Get('cron-history')
  getCronHistory(@Query('days') days?: string) {
    return this.resourcesService.getCronHistory(days ? parseInt(days, 10) : 14);
  }

  @Get('daily-usage')
  getDailyUsage(@Query('days') days?: string) {
    return this.resourcesService.getDailyUsage(days ? parseInt(days, 10) : 14);
  }

  @Patch('budget')
  updateBudget(
    @Body()
    body: {
      dailyMaxUsd?: number | null;
      warningThresholdPct?: number;
      strategy?: string;
      fallbackModel?: string | null;
    },
  ) {
    return this.agentsService.updateBudget(body);
  }

  @Get('cron-jobs/:id')
  getCronJob(@Param('id') id: string) {
    return this.resourcesService.getCronJob(id);
  }

  @Post('cron-jobs')
  addCronJob(@Body() body: Record<string, any>) {
    return this.resourcesService.addCronJob(body);
  }

  @Patch('cron-jobs/:id')
  updateCronJob(
    @Param('id') id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.resourcesService.updateCronJob(id, body);
  }

  @Delete('cron-jobs/:id')
  removeCronJob(@Param('id') id: string) {
    return this.resourcesService.removeCronJob(id);
  }

  @Patch('cron-jobs/:id/toggle')
  toggleCronJob(
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.resourcesService.toggleCronJob(id, body.enabled);
  }
}
