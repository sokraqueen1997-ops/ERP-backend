import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/user.dto';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

const SAFE_USER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  username: true,
  isActive: true,
  twoFactorEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true, code: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      select: SAFE_USER_SELECT,
      orderBy: { fullName: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: SAFE_USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  findByUsernameOrEmail(usernameOrEmail: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
      },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
  }

  findByIdWithPermissions(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
  }

  async create(dto: CreateUserDto, createdById?: string) {
    const [emailTaken, usernameTaken, role] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: dto.email } }),
      this.prisma.user.findUnique({ where: { username: dto.username } }),
      this.prisma.role.findUnique({ where: { id: dto.roleId } }),
    ]);
    if (emailTaken) throw new ConflictException('Email already in use');
    if (usernameTaken) throw new ConflictException('Username already in use');
    if (!role) throw new BadRequestException('Invalid roleId');

    if (dto.branchId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
      if (!branch) throw new BadRequestException('Invalid branchId');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        username: dto.username,
        passwordHash,
        roleId: dto.roleId,
        branchId: dto.branchId,
        createdById,
      },
      select: SAFE_USER_SELECT,
    });

    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);

    if (dto.roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
      if (!role) throw new BadRequestException('Invalid roleId');
    }
    if (dto.branchId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
      if (!branch) throw new BadRequestException('Invalid branchId');
    }

    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: SAFE_USER_SELECT,
    });
  }

  async resetPassword(id: string, dto: ResetPasswordDto) {
    await this.findOne(id);
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { success: true };
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: SAFE_USER_SELECT,
    });
  }

  static toAuthenticatedUser(user: {
    id: string;
    email: string;
    username: string;
    roleId: string;
    branchId: string | null;
    role: { name: string; permissions: { permission: { key: string } }[] };
  }): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      roleId: user.roleId,
      roleName: user.role.name,
      branchId: user.branchId,
      permissions: user.role.permissions.map((rp) => rp.permission.key),
    };
  }
}
