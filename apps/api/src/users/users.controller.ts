import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Method: GET
   * URL: /api/users/me
   * Purpose: Current user clinical/professional profile
   * Required permission: authenticated JWT
   * Response example: { data: { userId, email, licenseNumber, specialties, …, roles } }
   * Errors: 401, 404
   */
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const data = await this.usersService.getMe(user.id);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/users/me
   * Purpose: Update own clinical/availability profile fields
   * Required permission: authenticated JWT
   * Request body: UpdateProfileDto
   * Response example: { data: profile }
   * Errors: 400, 401, 404
   * Audit: user:profile-update
   */
  @Patch('me')
  async updateMe(
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.usersService.updateMe(user.id, dto, user);
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/users?q=&page=&limit=
   * Purpose: Identity search of staff users (name / username / email) — no credentials exposed
   * Required permission: user:read (RECORDS, ADMIN, SUPER_ADMIN, CMD, IT)
   * Request body: none
   * Response example: { data: { items: [{ userId, userName, email, firstName, lastName, role }], meta } }
   * Error cases: 401 unauthorized, 403 missing permission
   */
  @Get()
  @RequirePermissions(PERMISSIONS.USER_READ)
  async search(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.usersService.search({
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
    return { data: result };
  }
}
