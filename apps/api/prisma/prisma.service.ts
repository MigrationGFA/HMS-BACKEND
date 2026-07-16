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
    // #region agent log
    fetch('http://127.0.0.1:7838/ingest/28f02dd0-c205-4f8f-a1c9-0459405a272e', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '3bbec7',
      },
      body: JSON.stringify({
        sessionId: '3bbec7',
        location: 'prisma.service.ts:constructor',
        message: 'database config resolved',
        data: {
          hasHost: Boolean(host),
          hasUser: Boolean(user),
          hasPassword: Boolean(password),
          database,
          port,
          hasSslCaPath: Boolean(sslCaPath),
          userFormat: user?.includes('@') ? 'with-server-suffix' : 'bare-username',
        },
        timestamp: Date.now(),
        hypothesisId: 'B',
        runId: 'pre-fix',
      }),
    }).catch(() => {});
    // #endregion
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
    try {
      await this.$connect();
      // #region agent log
      fetch('http://127.0.0.1:7838/ingest/28f02dd0-c205-4f8f-a1c9-0459405a272e', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '3bbec7',
        },
        body: JSON.stringify({
          sessionId: '3bbec7',
          location: 'prisma.service.ts:onModuleInit',
          message: 'database connected',
          data: {},
          timestamp: Date.now(),
          hypothesisId: 'D',
          runId: 'pre-fix',
        }),
      }).catch(() => {});
      // #endregion
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7838/ingest/28f02dd0-c205-4f8f-a1c9-0459405a272e', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '3bbec7',
        },
        body: JSON.stringify({
          sessionId: '3bbec7',
          location: 'prisma.service.ts:onModuleInit',
          message: 'database connect failed',
          data: {
            errorName: error instanceof Error ? error.name : 'unknown',
            errorMessage:
              error instanceof Error ? error.message : String(error),
          },
          timestamp: Date.now(),
          hypothesisId: 'D',
          runId: 'pre-fix',
        }),
      }).catch(() => {});
      // #endregion
      throw error;
    }
  }
  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
export interface PrismaService extends PrismaClient {}
