import {
  Controller,
  Get,
  Put,
  Query,
  Body,
  UseGuards,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AgentTokenGuard } from '../auth/agent-token.guard';
import { FilesService } from './files.service';
import type { Response } from 'express';

@ApiTags('files')
@ApiBearerAuth('agent-token')
@Controller('files')
@UseGuards(AgentTokenGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get('tree')
  getTree() {
    return this.filesService.getTree();
  }

  @Get('content')
  getContent(@Query('root') root: string, @Query('path') filePath: string) {
    return this.filesService.getContent(root, filePath);
  }

  @Get('raw')
  async getRaw(
    @Query('root') root: string,
    @Query('path') filePath: string,
    @Res() res: Response,
  ) {
    const result = await this.filesService.resolveRawFile(root, filePath);
    if (!result) throw new NotFoundException('File not found');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${result.filename}"`,
    );
    res.setHeader('Content-Type', result.mime);
    res.setHeader('Content-Length', result.size);
    result.stream.pipe(res);
  }

  @Put('content')
  saveContent(@Body() dto: { root: string; path: string; content: string }) {
    return this.filesService.saveContent(dto.root, dto.path, dto.content);
  }
}
