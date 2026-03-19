const { PrismaClient } = require('../src/generated/prisma/client.js')
const { PrismaPg } = require('@prisma/adapter-pg')
const pg = require('pg')
const { randomBytes, scryptSync } = require('crypto')

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync('admin123', salt, 64).toString('hex')

  const user = await prisma.user.upsert({
    where: { email: 'admin@alkosto.com' },
    update: {},
    create: {
      email: 'admin@alkosto.com',
      passwordHash: `${salt}:${hash}`,
      role: 'ADMIN',
      isActive: true,
    },
  })
  console.log(`Seeded: ${user.email} (${user.id})`)

  await prisma.$disconnect()
  await pool.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
