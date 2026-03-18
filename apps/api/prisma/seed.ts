import { PrismaClient } from '../src/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { randomBytes, scryptSync } from 'crypto'
import 'dotenv/config'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: 'admin@alkosto.com' },
    update: {},
    create: {
      email: 'admin@alkosto.com',
      passwordHash: hashPassword('admin123'),
      role: 'ADMIN',
      isActive: true,
    },
  })
  console.log(`Seeded admin user: ${admin.email} (${admin.id})`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
