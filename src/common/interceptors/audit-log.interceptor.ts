import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

const METHOD_ACTION_MAP: Record<string, string> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, originalUrl, ip, headers } = request;

    const action = METHOD_ACTION_MAP[method];
    if (!action) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        const user: AuthenticatedUser | undefined = request.user;
        const resource = this.resourceFromPath(originalUrl);

        this.auditLogService
          .log({
            userId: user?.id,
            action,
            resource,
            method,
            path: originalUrl,
            ipAddress: ip,
            userAgent: headers?.['user-agent'],
          })
          .catch(() => {
            // Audit logging must never break the primary request.
          });
      }),
    );
  }

  private resourceFromPath(path: string): string {
    const segments = path.split('?')[0].split('/').filter(Boolean);
    return segments[2] ?? segments[0] ?? 'unknown';
  }
}
