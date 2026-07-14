import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
