import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EmailTriageQueueStatus } from '@prisma/client';
import type { Request } from 'express';
import { AgentTokenGuard } from '../auth/agent-token.guard';
import { EmailsService } from './emails.service';
import {
  EmailIntakeDto,
  TriageRegisterDto,
  TriageReviewDto,
  TriageRuleCreateDto,
  TriageRulePatchDto,
} from './dto';

@ApiTags('emails')
@ApiBearerAuth('agent-token')
@Controller('emails')
@UseGuards(AgentTokenGuard)
export class EmailsController {
  constructor(private readonly emailsService: EmailsService) {}

  @Post('intake')
  intake(@Body() dto: EmailIntakeDto) {
    return this.emailsService.intake(dto);
  }

  @Get('routing-map')
  getRoutingMap() {
    return this.emailsService.getRoutingMap();
  }

  @Get('triage-rules')
  getTriageRulesForAgent() {
    return this.emailsService.getTriageRulesForAgent();
  }

  @Post('triage/register')
  registerTriage(@Body() dto: TriageRegisterDto) {
    return this.emailsService.registerTriage(dto);
  }

  @Get('triage/queue')
  listTriage(
    @Query('status') status?: string,
  ) {
    const allowedStatuses = Object.values(EmailTriageQueueStatus) as string[];
    if (status && !allowedStatuses.includes(status)) {
      throw new BadRequestException(
        `Invalid status. Use: ${allowedStatuses.join(', ')}`,
      );
    }
    return this.emailsService.listTriageQueue(
      status as EmailTriageQueueStatus | undefined,
    );
  }

  @Patch('triage/:id')
  reviewTriage(
    @Param('id') id: string,
    @Body() dto: TriageReviewDto,
    @Req() req: Request,
  ) {
    const user = (req as Request & { user?: { id: string } }).user;
    return this.emailsService.reviewTriage(id, dto, user?.id);
  }

  @Get('triage/rules')
  listRules() {
    return this.emailsService.listTriageRules();
  }

  @Post('triage/rules')
  createRule(
    @Body() dto: TriageRuleCreateDto,
    @Req() req: Request,
  ) {
    const user = (req as Request & { user?: { id: string } }).user;
    return this.emailsService.createTriageRule(dto, user?.id);
  }

  @Patch('triage/rules/:id')
  patchRule(@Param('id') id: string, @Body() dto: TriageRulePatchDto) {
    return this.emailsService.patchTriageRule(id, dto);
  }

  @Delete('triage/rules/:id')
  deleteRule(@Param('id') id: string) {
    return this.emailsService.deleteTriageRule(id);
  }
}
