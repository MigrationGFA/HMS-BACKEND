import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { createPrismaClient } from './create-prisma-client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;

  constructor(configService: ConfigService) {
    const host = configService.get<string>('database.host');
    const user = configService.get<string>('database.user');
    const password = configService.get<string>('database.password');
    const database = configService.get<string>('database.name', 'postgres');
    const port = configService.get<number>('database.port', 5432);
    const sslCaPath = configService.get<string>('database.sslCaPath');

    if (!host || !user || !password) {
      throw new Error(
        'Database config missing: set DATABASE_HOST, DATABASE_USER, DATABASE_PASSWORD in .env',
      );
    }

    const { pool } = createPrismaClient({
      host,
      user,
      password,
      database,
      port,
      sslCaPath,
    });

    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}

export interface PrismaService extends PrismaClient {}
