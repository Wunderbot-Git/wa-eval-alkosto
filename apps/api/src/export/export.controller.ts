import {
  Controller,
  Post,
  Get,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { ExportService } from './export.service'
import { AuthGuard } from '../auth/auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'

@Controller('exports')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post('runs/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'INTERNAL_ALKOSTO')
  async createExport(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user
    return this.exportService.createExport(id, user.id)
  }

  @Get(':id/status')
  @UseGuards(AuthGuard)
  async getExportStatus(@Param('id') id: string) {
    return this.exportService.getExportStatus(id)
  }

  @Get(':id/download')
  @UseGuards(AuthGuard)
  async downloadExport(@Param('id') id: string, @Res() res: Response) {
    const result = await this.exportService.downloadExport(id)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
    res.send(result.data)
  }
}
