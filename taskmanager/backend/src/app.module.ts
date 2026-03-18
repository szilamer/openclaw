import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { EmailsModule } from './emails/emails.module';
import { ReportsModule } from './reports/reports.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { FilesModule } from './files/files.module';
import { ResourcesModule } from './resources/resources.module';
import { AgentsModule } from './agents/agents.module';
import { AppController } from './app.controller';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

@Module({
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    ProjectsModule,
    TasksModule,
    EmailsModule,
    ReportsModule,
    UsersModule,
    HealthModule,
    FilesModule,
    ResourcesModule,
    AgentsModule,
  ],
})
export class AppModule {}
