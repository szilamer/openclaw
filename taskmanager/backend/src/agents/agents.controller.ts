import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AgentTokenGuard } from '../auth/agent-token.guard';
import {
  AgentsService,
  AgentsResponse,
  ActivityEntry,
} from './agents.service';

@ApiTags('agents')
@ApiBearerAuth('agent-token')
@Controller('agents')
@UseGuards(AgentTokenGuard)
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  getAgents(): Promise<AgentsResponse> {
    return this.agentsService.getAgents();
  }

  @Get('available-models')
  getAvailableModels() {
    return this.agentsService.getAvailableModels();
  }

  @Get(':id/activity')
  getAgentActivity(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ): Promise<ActivityEntry[]> {
    return this.agentsService.getAgentActivity(
      id,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Post()
  createAgent(
    @Body()
    body: {
      id: string;
      name: string;
      theme?: string;
      emoji?: string;
      model?: string;
    },
  ) {
    return this.agentsService.createAgent(body);
  }

  @Patch(':id')
  updateAgent(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      model?: string;
      fallbacks?: string[];
      theme?: string;
      emoji?: string;
    },
  ) {
    return this.agentsService.updateAgent(id, body);
  }
}
