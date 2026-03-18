import {
  Controller,
  Post,
  Get,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Request } from 'express'
import { CatalogService } from './catalog.service'
import { AuthGuard } from '../auth/auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'

@Controller('catalogs')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post('upload')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'INTERNAL_ALKOSTO')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCatalog(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded')
    }
    const user = (req as any).user
    return this.catalogService.uploadCatalog(file, user.id)
  }

  @Get()
  @UseGuards(AuthGuard)
  async listCatalogs() {
    return this.catalogService.findAll()
  }
}
