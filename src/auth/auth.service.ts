import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TwoFactorService } from './two-factor/two-factor.service';
import { LoginDto } from './dto/login.dto';

interface RequestContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditLogService: AuditLogService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  async login(dto: LoginDto, ctx: RequestContext) {
    const user = await this.usersService.findByUsernameOrEmail(dto.usernameOrEmail);

    if (!user || !user.isActive) {
      await this.auditLogService.log({
        action: 'LOGIN_FAILED',
        resource: 'auth',
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
        metadata: { reason: 'user_not_found_or_inactive', identifier: dto.usernameOrEmail },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      await this.auditLogService.log({
        userId: user.id,
        action: 'LOGIN_FAILED',
        resource: 'auth',
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
        metadata: { reason: 'bad_password' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.twoFactorEnabled) {
      if (!dto.twoFactorCode) {
        throw new UnauthorizedException('Two-factor code required');
      }
      const valid = this.twoFactorService.verify(dto.twoFactorCode, user.twoFactorSecret ?? '');
      if (!valid) {
        await this.auditLogService.log({
          userId: user.id,
          action: 'LOGIN_FAILED',
          resource: 'auth',
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
          metadata: { reason: 'bad_2fa_code' },
        });
        throw new UnauthorizedException('Invalid two-factor code');
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.auditLogService.log({
      userId: user.id,
      action: 'LOGIN',
      resource: 'auth',
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    const authenticatedUser = UsersService.toAuthenticatedUser(user as any);
    const tokens = await this.issueTokens(user.id, ctx);
    return { user: authenticatedUser, ...tokens };
  }

  async refresh(refreshToken: string, ctx: RequestContext) {
    let payload: { sub: string };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET ?? 'change_me_refresh_secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.usersService.findByIdWithPermissions(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const authenticatedUser = UsersService.toAuthenticatedUser(user as any);
    const tokens = await this.issueTokens(user.id, ctx);
    return { user: authenticatedUser, ...tokens };
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async setupTwoFactor(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = this.twoFactorService.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: secret } });

    const otpauthUrl = this.twoFactorService.keyUri(user.email, secret);
    const qrCodeDataUrl = await this.twoFactorService.qrCodeDataUrl(otpauthUrl);
    return { otpauthUrl, qrCodeDataUrl };
  }

  async enableTwoFactor(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.twoFactorSecret) {
      throw new BadRequestException('Call /auth/2fa/setup first');
    }
    const valid = this.twoFactorService.verify(code, user.twoFactorSecret);
    if (!valid) {
      throw new BadRequestException('Invalid verification code');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
    return { success: true };
  }

  async disableTwoFactor(userId: string, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid password');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    return { success: true };
  }

  private async issueTokens(userId: string, ctx: RequestContext) {
    const accessToken = this.jwtService.sign(
      { sub: userId, type: 'access' },
      {
        secret: process.env.JWT_ACCESS_SECRET ?? 'change_me_access_secret',
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
      },
    );

    const refreshToken = this.jwtService.sign(
      { sub: userId, jti: crypto.randomUUID() },
      {
        secret: process.env.JWT_REFRESH_SECRET ?? 'change_me_refresh_secret',
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
      },
    );

    const decoded = this.jwtService.decode(refreshToken) as { exp: number };
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(decoded.exp * 1000),
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
