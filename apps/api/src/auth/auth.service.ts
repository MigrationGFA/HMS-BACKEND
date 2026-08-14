import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Users } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthUser } from './types/auth-user.type';
import { JwtPayload } from './types/jwt-payload.type';
import {
  generateRefreshToken,
  hashToken,
  parseExpiresInSeconds,
} from './utils/token.util';

type UserWithRole = Users & {
  role: { ROLE_NAME: string | null } | null;
};

function digitsOnly(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

function mustResetPassword(user: Users): boolean {
  const flag = (user.GENERATE_PIN ?? '').trim().toUpperCase();
  return flag === 'Y' || flag === '1' || flag === 'YES' || flag === 'TRUE';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto) {
    const email = dto.email?.trim() || '';
    const phone = dto.phone?.trim() || '';
    if (!email && !phone) {
      throw new BadRequestException('Email or phone is required');
    }

    const user = email
      ? await this.findUserByEmail(email)
      : await this.findUserByPhone(phone);
    if (!user) {
      throw new UnauthorizedException('Invalid phone/email or password');
    }

    await this.assertUserCanLogin(user);
    await this.verifyPassword(dto.password, user);

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { TOKEN_HASH: tokenHash },
      include: {
        user: {
          include: { role: true },
        },
      },
    });

    if (
      !stored ||
      stored.REVOKED_AT ||
      stored.EXPIRES_AT.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.assertUserCanLogin(stored.user);

    await this.prisma.refreshToken.update({
      where: { ID: stored.ID },
      data: { REVOKED_AT: new Date() },
    });

    return this.issueTokens(stored.user);
  }

  async logout(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: {
        TOKEN_HASH: tokenHash,
        REVOKED_AT: null,
      },
      data: { REVOKED_AT: new Date() },
    });

    return { success: true };
  }

  async getUserById(userId: number): Promise<AuthUser | null> {
    const user = await this.prisma.users.findUnique({
      where: { USER_ID: userId },
      include: { role: true },
    });

    if (!user) {
      return null;
    }

    return this.toAuthUser(user);
  }

  async changePassword(userId: number, dto: ChangePasswordDto, actor: AuthUser) {
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }
    const user = await this.prisma.users.findUnique({
      where: { USER_ID: userId },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid session');
    }
    await this.verifyPassword(dto.currentPassword, user);
    const hash = await bcrypt.hash(dto.newPassword, 12);
    const actorLabel =
      actor.email ||
      actor.phone ||
      [actor.firstName, actor.lastName].filter(Boolean).join(' ') ||
      'SYSTEM';
    await this.prisma.users.update({
      where: { USER_ID: userId },
      data: {
        PASSWORD: hash,
        PWD: hash,
        GENERATE_PIN: 'N',
        UPDATED_BY: actorLabel,
        UPDATED_DATE: new Date(),
      },
    });
    await this.audit.log({
      type: 'auth:change-password',
      entity: 'USERS',
      entityId: userId,
      userId,
      createdBy: actorLabel,
      status: 'Success',
    });
    return { success: true, mustResetPassword: false };
  }

  private async findUserByEmail(email: string): Promise<UserWithRole | null> {
    return this.prisma.users.findFirst({
      where: {
        EMAIL_ADDRESS: {
          equals: email,
          mode: 'insensitive',
        },
      },
      include: { role: true },
    });
  }

  private async findUserByPhone(phone: string): Promise<UserWithRole | null> {
    const digits = digitsOnly(phone);
    if (digits.length < 7) {
      return null;
    }

    const rows = await this.prisma.$queryRaw<Array<{ USER_ID: number }>>`
      SELECT "USER_ID"
      FROM "USERS"
      WHERE regexp_replace(COALESCE("PHONE_NO", ''), '[^0-9]', '', 'g') = ${digits}
         OR regexp_replace(COALESCE("PHONE_NO", ''), '[^0-9]', '', 'g')
              LIKE ${'%' + digits.slice(-10)}
      ORDER BY "USER_ID" ASC
      LIMIT 5
    `;

    if (rows.length === 0) {
      return null;
    }

    // Prefer exact digit match; first row is lowest USER_ID if multiples.
    return this.prisma.users.findUnique({
      where: { USER_ID: rows[0].USER_ID },
      include: { role: true },
    });
  }

  private async assertUserCanLogin(user: Users) {
    if (user.LOCK_ACCOUNT?.toUpperCase() === 'Y') {
      throw new UnauthorizedException('Account is locked');
    }

    if (user.EXPIRY_DATE && user.EXPIRY_DATE.getTime() <= Date.now()) {
      throw new UnauthorizedException('Account has expired');
    }
  }

  private async verifyPassword(password: string, user: Users) {
    const storedHash = user.PASSWORD ?? user.PWD;
    if (!storedHash) {
      throw new UnauthorizedException('Invalid phone/email or password');
    }

    const matches = await bcrypt.compare(password, storedHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid phone/email or password');
    }
  }

  private async issueTokens(user: UserWithRole) {
    const authUser = this.toAuthUser(user);
    const payload: JwtPayload = {
      sub: user.USER_ID,
      email: authUser.email,
      roles: authUser.roles,
    };

    const accessExpiresIn = this.configService.get<string>(
      'jwt.accessExpiresIn',
      '1h',
    );
    const refreshExpiresIn = this.configService.get<string>(
      'jwt.refreshExpiresIn',
      '12h',
    );

    const accessExpiresInSeconds = parseExpiresInSeconds(accessExpiresIn);
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: accessExpiresInSeconds,
    });
    const refreshToken = generateRefreshToken();
    const refreshExpiresAt = new Date(
      Date.now() + parseExpiresInSeconds(refreshExpiresIn) * 1000,
    );

    await this.prisma.refreshToken.create({
      data: {
        TOKEN_HASH: hashToken(refreshToken),
        USER_ID: user.USER_ID,
        EXPIRES_AT: refreshExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresInSeconds,
      user: authUser,
      mustResetPassword: authUser.mustResetPassword,
    };
  }

  private toAuthUser(user: UserWithRole): AuthUser {
    const roles = user.role?.ROLE_NAME ? [user.role.ROLE_NAME] : [];

    return {
      id: user.USER_ID,
      email: user.EMAIL_ADDRESS ?? '',
      phone: user.PHONE_NO ?? null,
      firstName: user.FIRST_NAME,
      lastName: user.LAST_NAME,
      roles,
      mustResetPassword: mustResetPassword(user),
    };
  }
}
