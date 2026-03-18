import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AgentTokenGuard } from '../auth/agent-token.guard';
import { EmailsService } from './emails.service';
import { EmailIntakeDto } from './dto';

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
}
