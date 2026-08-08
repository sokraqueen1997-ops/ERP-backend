import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DEFAULT_PERMISSIONS, DEFAULT_ROLES } from '../src/permissions/permissions.constants';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding permissions...');
  for (const perm of DEFAULT_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { module: perm.module, description: perm.description },
      create: perm,
    });
  }

  const allPermissions = await prisma.permission.findMany();

  console.log('Seeding default roles...');
  for (const roleDef of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: { description: roleDef.description, isSystem: roleDef.isSystem },
      create: {
        name: roleDef.name,
        description: roleDef.description,
        isSystem: roleDef.isSystem,
      },
    });

    const keys =
      roleDef.permissionKeys === 'ALL'
        ? allPermissions.map((p) => p.key)
        : roleDef.permissionKeys;

    const permissionIds = allPermissions
      .filter((p) => keys.includes(p.key))
      .map((p) => p.id);

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }

  console.log('Seeding default (head-office) branch...');
  const headOffice = await prisma.branch.upsert({
    where: { code: 'HQ' },
    update: {},
    create: { name: 'الفرع الرئيسي', code: 'HQ' },
  });

  console.log('Seeding first admin user...');
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'Admin' } });

  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@erp.local';
  const username = process.env.SEED_ADMIN_USERNAME ?? 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      fullName: 'System Administrator',
      email,
      username,
      passwordHash,
      roleId: adminRole.id,
      branchId: headOffice.id,
    },
  });

  console.log('Seed complete.');
  console.log(`Admin login -> username: "${username}" / password: "${password}"`);
  console.log('IMPORTANT: change this password immediately after first login.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
