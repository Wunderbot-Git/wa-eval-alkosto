import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '../generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private pool: pg.Pool

  constructor() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    const adapter = new PrismaPg(pool as any)
    super({ adapter })
    this.pool = pool
  }

  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
    await this.pool.end()
  }
}
