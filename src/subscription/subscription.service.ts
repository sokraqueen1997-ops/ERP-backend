import { Injectable, Logger } from '@nestjs/common';

/**
 * Optional integration with the platform's tenant registry. Entirely inert
 * unless PLATFORM_API_URL, TENANT_SUBDOMAIN, and PLATFORM_INTERNAL_API_KEY
 * are all set — so this system's own (non-tenant) deployment is completely
 * unaffected. Fails OPEN on any error (network issue, platform down, etc.)
 * so a platform outage can never lock a paying customer out of their own
 * live business system.
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  private isConfigured(): boolean {
    return Boolean(
      process.env.PLATFORM_API_URL && process.env.TENANT_SUBDOMAIN && process.env.PLATFORM_INTERNAL_API_KEY,
    );
  }

  /**
   * Returns the tenant's current status (e.g. "ACTIVE", "SUSPENDED",
   * "EXPIRED") from the platform, or null if the check isn't configured or
   * couldn't be completed — null always means "allow access".
   */
  async checkStatus(): Promise<string | null> {
    if (!this.isConfigured()) return null;

    try {
      const url = `${process.env.PLATFORM_API_URL}/tenants/resolve/${process.env.TENANT_SUBDOMAIN}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000); // never block login for long

      const res = await fetch(url, {
        headers: { 'x-internal-api-key': process.env.PLATFORM_INTERNAL_API_KEY! },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        this.logger.warn(`Platform status check failed with HTTP ${res.status} — allowing access.`);
        return null;
      }

      const data = await res.json();
      return typeof data.status === 'string' ? data.status : null;
    } catch (err) {
      this.logger.warn(`Platform status check unreachable — allowing access. (${err})`);
      return null;
    }
  }
}
