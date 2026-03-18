import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { AuthGuard } from './auth.guard'
import { LoginDto } from './dto/login.dto'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private get cookieMaxAgeMs(): number {
    const hours = parseInt(process.env.SESSION_MAX_AGE_HOURS || '24', 10)
    return hours * 60 * 60 * 1000
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { sessionId, user } = await this.authService.login(body.email, body.password)
    res.cookie('session_id', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: this.cookieMaxAgeMs,
    })
    return user
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionId = req.cookies?.session_id
    if (sessionId) {
      await this.authService.logout(sessionId)
    }
    res.clearCookie('session_id', { path: '/' })
    return { ok: true }
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: Request) {
    return (req as any).user
  }
}
