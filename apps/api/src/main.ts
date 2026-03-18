import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { json, urlencoded } from 'express'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })

  // Structured logging with pino
  app.useLogger(app.get(Logger))

  // Security headers
  app.use(helmet())

  // Cookie parsing
  app.use(cookieParser())

  // Body size limits
  app.use(json({ limit: '50mb' }))
  app.use(urlencoded({ extended: true, limit: '50mb' }))

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  // CORS with configurable origin
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000'
  app.enableCors({
    origin: corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  })

  const port = process.env.API_PORT || 3001
  await app.listen(port)
  console.log(`API running on http://localhost:${port}`)
}
bootstrap()
