import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AgentTokenGuard } from '../auth/agent-token.guard';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth('agent-token')
@Controller('reports')
@UseGuards(AgentTokenGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('daily')
  daily(@Query('date') date?: string) {
    return this.reportsService.getDailySummary(date);
  }
}
