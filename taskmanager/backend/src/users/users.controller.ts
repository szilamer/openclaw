import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AgentTokenGuard } from '../auth/agent-token.guard';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('agent-token')
@Controller('users')
@UseGuards(AgentTokenGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }
}
