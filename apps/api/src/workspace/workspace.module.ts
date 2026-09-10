import { Module, Controller, Get, Post, Patch, Param, Body, Req, UploadedFile, UseInterceptors, UseGuards, BadRequestException } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { WorkspaceService } from './workspace.service'
import { WorkspaceCronService } from './workspace-cron.service'
import { AuthModule } from '../auth/auth.module'
import { AuthGuard } from '../auth/auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'

@Controller('workspace')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN', 'INTERNAL_ALKOSTO')
class WorkspaceController {
  constructor(private readonly service: WorkspaceService) {}
  @Get() overview() { return this.service.overview() }
  @Post('bigquery') bigquery(@Body() body: any) { return this.service.importBigQuery(body) }
  @Post('bigquery/daily') daily() { return this.service.importPreviousDay() }
  @Post('bigquery/preview') preview(@Body() body: any) { return this.service.previewBigQuery(body) }
  @Get('sessions/:id') detail(@Param('id') id: string) { return this.service.detail(id) }
  @Post('import') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  import(@UploadedFile() file: Express.Multer.File) { if (!file) throw new BadRequestException('Selecciona un CSV'); return this.service.importCsv(file.buffer) }
  @Post('catalogs') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  catalog(@UploadedFile() file: Express.Multer.File, @Body() body: any) { if (!file) throw new BadRequestException('Selecciona un JSON'); return this.service.importCatalog(file.buffer, body.source, body.capturedAt) }
  @Post('sessions/:id/evaluate') evaluate(@Param('id') id: string) { return this.service.evaluate(id) }
  @Post('evaluate/pending') evaluatePending(@Body() body: any) { return this.service.startPendingEvaluation(body) }
  @Post('sessions/:id/assistant') assistant(@Param('id') id: string, @Body() body: any, @Req() req: any) { return this.service.assistant(id, body, req.user.id) }
  @Get('calibration') calibration() { return this.service.calibration() }
  @Post('sessions/:id/flags') flag(@Param('id') id: string, @Body() body: any, @Req() req: any) { return this.service.flagSession(id, body, req.user.id) }
  @Patch('flags/:id') resolveFlag(@Param('id') id: string, @Body() body: any, @Req() req: any) { return this.service.resolveFlag(id, body, req.user.id) }
  @Post('assessments/:id/review') review(@Param('id') id: string, @Body() body: any, @Req() req: any) { return this.service.reviewAssessment(id, body, req.user.id) }
  @Post('assessments/:id/guided-review') guided(@Param('id') id: string, @Body() body: any, @Req() req: any) { return this.service.guidedReview(id, body, req.user.id) }
  @Post('issues') issue(@Body() body: any) { return this.service.createIssue(body) }
  @Patch('issues/:id') update(@Param('id') id: string, @Body() body: any, @Req() req: any) { return this.service.updateIssue(id, body, req.user.id) }
  @Get('issues/:id/draft') draft(@Param('id') id: string) { return this.service.issueDraft(id) }
  @Post('tests') test(@Body() body: any) { return this.service.createTest(body) }
  @Post('tests/:id/executions') execute(@Param('id') id: string, @Body() body: any, @Req() req: any) { return this.service.executeTest(id, body, req.user.id) }
}
@Module({ imports: [AuthModule], controllers: [WorkspaceController], providers: [WorkspaceService, WorkspaceCronService] })
export class WorkspaceModule {}
