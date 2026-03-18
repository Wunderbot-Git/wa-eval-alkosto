import { Module } from '@nestjs/common'
import { ConversationParserService } from './conversation-parser.service'
import { ConversationController } from './conversation.controller'
import { AuthModule } from '../auth/auth.module'
import { SharingModule } from '../sharing/sharing.module'

@Module({
  imports: [AuthModule, SharingModule],
  controllers: [ConversationController],
  providers: [ConversationParserService],
  exports: [ConversationParserService],
})
export class ConversationsModule {}
