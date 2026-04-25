import 'reflect-metadata'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'

loadEnv({ path: resolve(__dirname, '../../../.env') })

import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
    ],
    credentials: true,
  })
  const port = Number(process.env.BACKEND_PORT ?? 4000)
  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`[backend] listening on http://localhost:${port}`)
}

void bootstrap()
