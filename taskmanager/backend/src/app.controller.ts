import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  root() {
    return { name: 'TaskManager API', version: '1.0', docs: '/api/docs' };
  }
}
