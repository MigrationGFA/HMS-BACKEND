import { SetMetadata } from '@nestjs/common';
import type { PermissionName } from '../constants/permissions.constants';

export const PERMISSIONS_KEY = 'required_permissions';

/** Declare the permission(s) required to hit a route (any one grants access). */
export const RequirePermissions = (...permissions: PermissionName[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
