import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthGuard } from './auth.guard'
import { UnauthorizedException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'

function makeContext(cookies: Record<string, string> = {}) {
  const req = { cookies, user: undefined }
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext
  return { ctx, req }
}

describe('AuthGuard', () => {
  let guard: AuthGuard
  let authService: { validateSession: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    authService = { validateSession: vi.fn() }
    guard = new AuthGuard(authService as any)
  })

  it('should throw if no session_id cookie', async () => {
    const { ctx } = makeContext({})
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
  })

  it('should throw if session is invalid', async () => {
    authService.validateSession.mockResolvedValue(null)
    const { ctx } = makeContext({ session_id: 'bad-id' })
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
  })

  it('should attach user and return true for valid session', async () => {
    const user = { id: 'u1', email: 'a@b.com', role: 'ADMIN' }
    authService.validateSession.mockResolvedValue(user)
    const { ctx, req } = makeContext({ session_id: 'valid-id' })

    const result = await guard.canActivate(ctx)

    expect(result).toBe(true)
    expect((req as any).user).toEqual(user)
  })
})
