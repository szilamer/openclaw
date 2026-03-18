import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AgentTokenGuard } from '../auth/agent-token.guard';
import { TasksService } from './tasks.service';
import {
  CreateTaskDto,
  UpdateTaskDto,
  UpdateLiveStatusDto,
  MoveTaskDto,
  CreateCommentDto,
  AddDependencyDto,
} from './dto';
import { TaskStatus } from '@prisma/client';

@ApiTags('tasks')
@ApiBearerAuth('agent-token')
@Controller('tasks')
@UseGuards(AgentTokenGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(
    @Query('project') projectId?: string,
    @Query('sub_project') subProjectId?: string,
    @Query('status') status?: TaskStatus,
    @Query('due_before') dueBefore?: string,
    @Query('assignee') assigneeId?: string,
    @Query('label') labelId?: string,
  ) {
    return this.tasksService.findAll({
      projectId,
      subProjectId,
      status,
      dueBefore,
      assigneeId,
      labelId,
    });
  }

  @Post()
  create(@Body() dto: CreateTaskDto, @Req() req: any) {
    return this.tasksService.create(dto, req.agentToken?.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasksService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @Req() req: any,
  ) {
    return this.tasksService.update(id, dto, req.agentToken?.id);
  }

  @Post(':id/move')
  move(
    @Param('id') id: string,
    @Body() dto: MoveTaskDto,
    @Req() req: any,
  ) {
    return this.tasksService.move(id, dto.status, req.agentToken?.id);
  }

  @Patch(':id/live-status')
  updateLiveStatus(
    @Param('id') id: string,
    @Body() dto: UpdateLiveStatusDto,
  ) {
    return this.tasksService.updateLiveStatus(id, dto.liveStatus);
  }

  @Patch(':id/notes')
  updateNotes(
    @Param('id') id: string,
    @Body() dto: { notes: string },
  ) {
    return this.tasksService.updateNotes(id, dto.notes);
  }

  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @Req() req: any,
  ) {
    return this.tasksService.addComment(id, dto.content, req.user?.id);
  }

  @Get(':id/dependencies')
  getDependencies(@Param('id') id: string) {
    return this.tasksService.getDependencies(id);
  }

  @Post(':id/dependencies')
  addDependency(
    @Param('id') id: string,
    @Body() dto: AddDependencyDto,
  ) {
    return this.tasksService.addDependency(id, dto.prerequisiteId);
  }

  @Delete(':id/dependencies/:prerequisiteId')
  removeDependency(
    @Param('id') id: string,
    @Param('prerequisiteId') prerequisiteId: string,
  ) {
    return this.tasksService.removeDependency(id, prerequisiteId);
  }
}
