import { Module } from '@nestjs/common'
import { ExportService } from './export.service'
import { ExportController } from './export.controller'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  controllers: [ExportController],
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
