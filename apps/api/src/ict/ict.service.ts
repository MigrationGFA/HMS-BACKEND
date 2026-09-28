import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IctService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const since15m = new Date(Date.now() - 15 * 60 * 1000);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      activeRefreshTokensLast15m,
      openSupportTickets,
      auditEventsLast24h,
      failedLoginLast24h,
      userCount,
    ] = await Promise.all([
      this.prisma.refreshToken.count({
        where: {
          CREATED_AT: { gte: since15m },
          REVOKED_AT: null,
          EXPIRES_AT: { gt: new Date() },
        },
      }),
      this.prisma.supportRequests.count({
        where: { STATUS: { in: ['Open', 'In Progress'] } },
      }),
      this.prisma.audits.count({
        where: { CREATE_DATE: { gte: since24h } },
      }),
      this.prisma.audits.count({
        where: {
          CREATE_DATE: { gte: since24h },
          AUDIT_TYPE: {
            in: ['auth:login-failed', 'auth:login:failed', 'auth:failed'],
          },
        },
      }),
      this.prisma.users.count(),
    ]);

    return {
      asOf: new Date().toISOString(),
      activeRefreshTokensLast15m,
      openSupportTickets,
      auditEventsLast24h,
      failedLoginLast24h,
      userCount,
      instrumentation: {
        serversInstrumented: false,
        backupInstrumented: false,
      },
    };
  }
}
