import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const port = Number(process.env.BACKEND_PORT ?? 4000)
  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`[backend] listening on http://localhost:${port}`)
}

void bootstrap()
