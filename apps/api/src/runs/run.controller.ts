import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Request } from 'express'
import { RunService } from './run.service'
import { PipelineService } from '../pipeline/pipeline.service'
import { SharingService } from '../sharing/sharing.service'
import { AuthGuard } from '../auth/auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'

@Controller('runs')
export class RunController {
  constructor(
    private readonly runService: RunService,
    private readonly pipelineService: PipelineService,
    private readonly sharingService: SharingService,
  ) {}

  @Post('upload')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'INTERNAL_ALKOSTO')
  @UseInterceptors(FileInterceptor('file'))
  async uploadRun(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded')
    }
    const user = (req as any).user
    return this.runService.createRun(file, user.id)
  }

  @Get('latest')
  @UseGuards(AuthGuard)
  async getLatestRun(@Req() req: Request) {
    const user = (req as any).user
    return this.runService.findLatest(user.id)
  }

  @Get()
  @UseGuards(AuthGuard)
  async listRuns(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const user = (req as any).user
    return this.runService.findAll(
      user.id,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    )
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  async getRun(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user
    if (user.role === 'YALO_READER') {
      const shared = await this.sharingService.isShared(id)
      if (!shared) throw new ForbiddenException('Run not shared with you')
    }
    return this.runService.findById(id)
  }

  @Get(':id/summary')
  @UseGuards(AuthGuard)
  async getRunSummary(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user
    if (user.role === 'YALO_READER') {
      const shared = await this.sharingService.isShared(id)
      if (!shared) throw new ForbiddenException('Run not shared with you')
    }
    return this.runService.getRunSummary(id)
  }

  @Get(':id/comparison')
  @UseGuards(AuthGuard)
  async getRunComparison(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user
    if (user.role === 'YALO_READER') {
      const shared = await this.sharingService.isShared(id)
      if (!shared) throw new ForbiddenException('Run not shared with you')
    }
    return this.runService.getRunComparison(id)
  }

  @Get(':id/conversations')
  @UseGuards(AuthGuard)
  async getRunConversations(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('label') label?: string,
    @Req() req?: Request,
  ) {
    const user = (req as any).user
    if (user.role === 'YALO_READER') {
      const shared = await this.sharingService.isShared(id)
      if (!shared) throw new ForbiddenException('Run not shared with you')
    }
    return this.runService.getRunConversations(
      id,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      status,
      label,
    )
  }

  @Post(':id/launch')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'INTERNAL_ALKOSTO')
  async launchRun(@Param('id') id: string) {
    return this.pipelineService.launchRun(id)
  }

  @Post(':id/cancel')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'INTERNAL_ALKOSTO')
  async cancelRun(@Param('id') id: string) {
    return this.pipelineService.cancelRun(id)
  }

  @Get(':id/status')
  @UseGuards(AuthGuard)
  async getRunStatus(@Param('id') id: string) {
    return this.pipelineService.getRunStatus(id)
  }
}
