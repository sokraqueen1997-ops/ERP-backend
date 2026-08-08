import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Marks a route as requiring one or more permission keys, e.g.:
 *   @RequirePermissions('users.manage')
 *   @RequirePermissions('reports.view', 'reports.export')
 * The user must hold ALL listed permissions (via their role) to pass the guard.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const PUBLIC_KEY = 'isPublic';

/** Marks a route as not requiring authentication at all (e.g. login). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
