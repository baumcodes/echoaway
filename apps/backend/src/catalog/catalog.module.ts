import { Module } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import { CatalogController } from './catalog.controller.js'
import { CatalogService } from './catalog.service.js'

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, PrismaService],
})
export class CatalogModule {}
