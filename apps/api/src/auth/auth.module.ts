import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { parseExpiresInSeconds } from './utils/token.util';
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('jwt.accessSecret');
        // #region agent log
        fetch('http://127.0.0.1:7838/ingest/28f02dd0-c205-4f8f-a1c9-0459405a272e', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': '3bbec7',
          },
          body: JSON.stringify({
            sessionId: '3bbec7',
            location: 'auth.module.ts:useFactory',
            message: 'jwt config resolved',
            data: { hasJwtAccessSecret: Boolean(secret) },
            timestamp: Date.now(),
            hypothesisId: 'C',
            runId: 'pre-fix',
          }),
        }).catch(() => {});
        // #endregion
        if (!secret) {
          throw new Error('JWT_ACCESS_SECRET is not configured');
        }
        return {
          secret,
          signOptions: {
            expiresIn: parseExpiresInSeconds(
              configService.get<string>('jwt.accessExpiresIn', '1h'),
            ),
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
