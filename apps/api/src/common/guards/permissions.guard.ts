import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../../auth/types/auth-user.type';
import {
  permissionsForRoles,
  type PermissionName,
} from '../constants/permissions.constants';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

/**
 * Resolves the authenticated user's roles (set by JwtAuthGuard) into
 * permissions and rejects if none of the required permissions are granted.
 * Use after JwtAuthGuard: @UseGuards(JwtAuthGuard, PermissionsGuard).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionName[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Missing authenticated user');
    }

    const granted = permissionsForRoles(user.roles ?? []);
    const allowed = required.some((p) => granted.has(p));
    if (!allowed) {
      throw new ForbiddenException(
        `Missing permission: ${required.join(' or ')}`,
      );
    }
    return true;
  }
}
