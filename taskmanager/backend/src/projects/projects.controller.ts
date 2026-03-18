import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AgentTokenGuard } from '../auth/agent-token.guard';
import { ProjectsService } from './projects.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  CreateContactDto,
  UpdateContactDto,
  SetMembersDto,
  CreateSubProjectDto,
  UpdateSubProjectDto,
} from './dto';

@ApiTags('projects')
@ApiBearerAuth('agent-token')
@Controller('projects')
@UseGuards(AgentTokenGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  // ── KB Sync (static routes before :id) ──

  @Post('sync-kb')
  syncKb() {
    return this.projectsService.syncAllFromFiles();
  }

  @Get('kb-files')
  listKbFiles() {
    return this.projectsService.listKbFiles();
  }

  // ── Sub-Projects (static routes before :id) ──

  @Get('sub-projects/:subId')
  getSubProject(@Param('subId', ParseUUIDPipe) subId: string) {
    return this.projectsService.getSubProject(subId);
  }

  @Patch('sub-projects/:subId')
  updateSubProject(
    @Param('subId', ParseUUIDPipe) subId: string,
    @Body() dto: UpdateSubProjectDto,
  ) {
    return this.projectsService.updateSubProject(subId, dto);
  }

  @Delete('sub-projects/:subId')
  removeSubProject(@Param('subId', ParseUUIDPipe) subId: string) {
    return this.projectsService.removeSubProject(subId);
  }

  @Post('sub-projects/:subId/trigger-planning')
  triggerPlanning(@Param('subId', ParseUUIDPipe) subId: string) {
    return this.projectsService.triggerPlanning(subId);
  }

  // ── Parameterized routes ──

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.remove(id);
  }

  @Get(':id/tasks')
  getTasks(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.getTasks(id);
  }

  @Get(':id/kb-status')
  getKbStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.getKbSyncStatus(id);
  }

  @Post(':id/link-kb')
  async linkKbFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('fileName') fileName: string,
  ) {
    await this.projectsService.linkKbFile(id, fileName);
    return { success: true };
  }

  // ── Contacts ──

  @Get(':id/contacts')
  getContacts(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.getContacts(id);
  }

  @Post(':id/contacts')
  addContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateContactDto,
  ) {
    return this.projectsService.addContact(id, dto);
  }

  @Patch('contacts/:contactId')
  updateContact(
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.projectsService.updateContact(contactId, dto);
  }

  @Delete('contacts/:contactId')
  removeContact(@Param('contactId', ParseUUIDPipe) contactId: string) {
    return this.projectsService.removeContact(contactId);
  }

  // ── Members (access) ──

  @Get(':id/members')
  getMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.getMembers(id);
  }

  @Put(':id/members')
  setMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetMembersDto,
  ) {
    return this.projectsService.setMembers(id, dto);
  }

  // ── Sub-Projects (nested under project) ──

  @Get(':id/sub-projects')
  getSubProjects(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.getSubProjects(id);
  }

  @Post(':id/sub-projects')
  createSubProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSubProjectDto,
  ) {
    return this.projectsService.createSubProject(id, dto);
  }
}
