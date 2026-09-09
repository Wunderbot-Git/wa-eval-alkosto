import { Module } from '@nestjs/common'
import { WorkspaceModule } from './workspace/workspace.module'
import { APP_GUARD } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { LoggerModule } from 'nestjs-pino'
import { PrismaModule } from './prisma/prisma.module'
import { HealthController } from './health/health.controller'
import { AuthModule } from './auth/auth.module'
import { InvitationModule } from './invitations/invitation.module'
import { UserModule } from './users/user.module'
import { CatalogModule } from './catalog/catalog.module'
import { ConversationsModule } from './conversations/conversations.module'
import { RunModule } from './runs/run.module'
import { QueueModule } from './queue/queue.module'
import { PipelineModule } from './pipeline/pipeline.module'
import { JudgesModule } from './judges/judges.module'
import { EvaluationModule } from './evaluation/evaluation.module'
import { SharingModule } from './sharing/sharing.module'
import { ExportModule } from './export/export.module'
import { RetentionModule } from './retention/retention.module'
import { ReevaluationModule } from './reevaluation/reevaluation.module'

@Module({
  imports: [
    WorkspaceModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    LoggerModule.forRoot({
      pinoHttp: {
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        genReqId: (req: any) => {
          return req.headers['x-correlation-id'] || require('crypto').randomUUID()
        },
        autoLogging: true,
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino/file', options: { destination: 1 } }
          : undefined,
      },
    }),
    PrismaModule,
    QueueModule,
    AuthModule,
    InvitationModule,
    UserModule,
    CatalogModule,
    ConversationsModule,
    RunModule,
    PipelineModule,
    JudgesModule,
    EvaluationModule,
    SharingModule,
    ExportModule,
    RetentionModule,
    ReevaluationModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
