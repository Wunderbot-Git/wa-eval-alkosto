import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import { AuthService } from './auth.service'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>()
    const sessionId = req.cookies?.session_id
    if (!sessionId) {
      throw new UnauthorizedException('No session')
    }

    const user = await this.authService.validateSession(sessionId)
    if (!user) {
      throw new UnauthorizedException('Invalid or expired session')
    }

    ;(req as any).user = user
    return true
  }
}
