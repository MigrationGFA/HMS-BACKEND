import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import type { UpdateProfileDto } from './dto/update-profile.dto';

export type UserSummary = {
  userId: number;
  userName: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  isAdmin: boolean;
  locked: boolean;
};

export type UserProfile = {
  userId: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phoneNo: string | null;
  licenseNumber: string | null;
  specialties: string | null;
  subSpecialty: string | null;
  qualifications: string | null;
  departmentName: string | null;
  clinicName: string | null;
  consultationHours: string | null;
  wardAssignment: string | null;
  roles: string[];
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getMe(userId: number): Promise<UserProfile> {
    const user = await this.prisma.users.findUnique({
      where: { USER_ID: userId },
      include: { role: { select: { ROLE_NAME: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.toProfile(user);
  }

  async updateMe(
    userId: number,
    dto: UpdateProfileDto,
    actor: AuthUser,
  ): Promise<UserProfile> {
    const existing = await this.prisma.users.findUnique({
      where: { USER_ID: userId },
    });
    if (!existing) throw new NotFoundException('User not found');

    const actorLabel =
      actor.email ||
      [actor.firstName, actor.lastName].filter(Boolean).join(' ') ||
      'SYSTEM';
    const now = new Date();

    const updated = await this.prisma.users.update({
      where: { USER_ID: userId },
      data: {
        ...(dto.firstName !== undefined
          ? { FIRST_NAME: dto.firstName.trim() || null }
          : {}),
        ...(dto.lastName !== undefined
          ? { LAST_NAME: dto.lastName.trim() || null }
          : {}),
        ...(dto.licenseNumber !== undefined
          ? { LICENSE_NUMBER: dto.licenseNumber.trim() || null }
          : {}),
        ...(dto.specialties !== undefined
          ? { SPECIALTIES: dto.specialties.trim() || null }
          : {}),
        ...(dto.subSpecialty !== undefined
          ? { SUB_SPECIALTY: dto.subSpecialty.trim() || null }
          : {}),
        ...(dto.qualifications !== undefined
          ? { QUALIFICATIONS: dto.qualifications.trim() || null }
          : {}),
        ...(dto.departmentName !== undefined
          ? { DEPARTMENT_NAME: dto.departmentName.trim() || null }
          : {}),
        ...(dto.clinicName !== undefined
          ? { CLINIC_NAME: dto.clinicName.trim() || null }
          : {}),
        ...(dto.consultationHours !== undefined
          ? { CONSULTATION_HOURS: dto.consultationHours.trim() || null }
          : {}),
        ...(dto.wardAssignment !== undefined
          ? { WARD_ASSIGNMENT: dto.wardAssignment.trim() || null }
          : {}),
        ...(dto.phoneNo !== undefined
          ? { PHONE_NO: dto.phoneNo.trim() || null }
          : {}),
        UPDATED_BY: actorLabel,
        UPDATED_DATE: now,
      },
      include: { role: { select: { ROLE_NAME: true } } },
    });

    await this.audit.log({
      type: 'user:profile-update',
      entity: 'USERS',
      entityId: userId,
      userId,
      createdBy: actorLabel,
      newValue: {
        licenseNumber: updated.LICENSE_NUMBER,
        specialties: updated.SPECIALTIES,
        clinicName: updated.CLINIC_NAME,
      },
    });

    return this.toProfile(updated);
  }

  private toProfile(user: {
    USER_ID: number;
    EMAIL_ADDRESS: string | null;
    FIRST_NAME: string | null;
    LAST_NAME: string | null;
    PHONE_NO: string | null;
    LICENSE_NUMBER: string | null;
    SPECIALTIES: string | null;
    SUB_SPECIALTY: string | null;
    QUALIFICATIONS: string | null;
    DEPARTMENT_NAME: string | null;
    CLINIC_NAME: string | null;
    CONSULTATION_HOURS: string | null;
    WARD_ASSIGNMENT: string | null;
    role: { ROLE_NAME: string | null } | null;
  }): UserProfile {
    return {
      userId: user.USER_ID,
      email: user.EMAIL_ADDRESS,
      firstName: user.FIRST_NAME,
      lastName: user.LAST_NAME,
      phoneNo: user.PHONE_NO,
      licenseNumber: user.LICENSE_NUMBER,
      specialties: user.SPECIALTIES,
      subSpecialty: user.SUB_SPECIALTY,
      qualifications: user.QUALIFICATIONS,
      departmentName: user.DEPARTMENT_NAME,
      clinicName: user.CLINIC_NAME,
      consultationHours: user.CONSULTATION_HOURS,
      wardAssignment: user.WARD_ASSIGNMENT,
      roles: user.role?.ROLE_NAME ? [user.role.ROLE_NAME] : [],
    };
  }

  /** Identity lookup — never exposes password hashes or credentials. */
  async search(params?: { q?: string; page?: number; limit?: number }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 20, 1), 100);
    const term = params?.q?.trim();

    const where: Prisma.UsersWhereInput = term
      ? {
          OR: [
            { USER_NAME: { contains: term, mode: 'insensitive' } },
            { EMAIL_ADDRESS: { contains: term, mode: 'insensitive' } },
            { FIRST_NAME: { contains: term, mode: 'insensitive' } },
            { LAST_NAME: { contains: term, mode: 'insensitive' } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.users.findMany({
        where,
        orderBy: { USER_ID: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { role: { select: { ROLE_NAME: true } } },
      }),
      this.prisma.users.count({ where }),
    ]);

    const items: UserSummary[] = rows.map((u) => ({
      userId: u.USER_ID,
      userName: u.USER_NAME,
      email: u.EMAIL_ADDRESS,
      firstName: u.FIRST_NAME,
      lastName: u.LAST_NAME,
      role: u.role?.ROLE_NAME ?? null,
      isAdmin: u.IS_ADMIN?.toUpperCase() === 'Y',
      locked: u.LOCK_ACCOUNT?.toUpperCase() === 'Y',
    }));

    return { items, meta: { page, limit, total } };
  }
}
