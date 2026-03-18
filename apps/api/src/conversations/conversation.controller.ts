import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common'
import type { Request } from 'express'
import { PrismaService } from '../prisma/prisma.service'
import { SharingService } from '../sharing/sharing.service'
import { AuthGuard } from '../auth/auth.guard'

@Controller('conversations')
export class ConversationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sharingService: SharingService,
  ) {}

  @Get(':id')
  @UseGuards(AuthGuard)
  async getConversation(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user

    if (user.role === 'YALO_READER') {
      const shared = await this.sharingService.isConversationShared(id)
      if (!shared) {
        throw new ForbiddenException('Conversation not shared with you')
      }
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { orderIndex: 'asc' } },
        evaluation: {
          include: {
            findings: true,
            patterns: true,
          },
        },
        snapshot: true,
      },
    })

    if (!conversation) {
      throw new NotFoundException('Conversation not found')
    }

    return conversation
  }
}
