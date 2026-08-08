export interface PermissionSeed {
  key: string;
  module: string;
  description: string;
}

export const DEFAULT_PERMISSIONS: PermissionSeed[] = [
  { key: 'users.view', module: 'users', description: 'عرض المستخدمين' },
  { key: 'users.manage', module: 'users', description: 'إضافة وتعديل وحذف المستخدمين' },
  { key: 'roles.view', module: 'roles', description: 'عرض الأدوار والصلاحيات' },
  { key: 'roles.manage', module: 'roles', description: 'إدارة الأدوار والصلاحيات' },
  { key: 'branches.view', module: 'branches', description: 'عرض الفروع' },
  { key: 'branches.manage', module: 'branches', description: 'إدارة الفروع' },
  { key: 'audit.view', module: 'audit', description: 'الاطلاع على سجل العمليات' },

  { key: 'products.view', module: 'products', description: 'عرض المنتجات' },
  { key: 'products.manage', module: 'products', description: 'إدارة المنتجات' },
  { key: 'inventory.view', module: 'inventory', description: 'عرض المخزون' },
  { key: 'inventory.manage', module: 'inventory', description: 'إدارة حركة المخزون والجرد' },
  { key: 'purchases.view', module: 'purchases', description: 'عرض المشتريات' },
  { key: 'purchases.manage', module: 'purchases', description: 'إدارة أوامر الشراء' },
  { key: 'quotations.view', module: 'quotations', description: 'عرض عروض الأسعار' },
  { key: 'quotations.manage', module: 'quotations', description: 'إنشاء وتعديل عروض الأسعار' },
  { key: 'sales.view', module: 'sales', description: 'عرض المبيعات' },
  { key: 'sales.manage', module: 'sales', description: 'إدارة فواتير ومرتجعات البيع' },
  { key: 'invoices.manage', module: 'invoices', description: 'إصدار الفواتير الإلكترونية وربط ZATCA' },
  { key: 'customers.view', module: 'customers', description: 'عرض العملاء' },
  { key: 'customers.manage', module: 'customers', description: 'إدارة بيانات وحسابات العملاء' },
  { key: 'suppliers.view', module: 'suppliers', description: 'عرض الموردين' },
  { key: 'suppliers.manage', module: 'suppliers', description: 'إدارة بيانات وحسابات الموردين' },
  { key: 'accounting.view', module: 'accounting', description: 'عرض السجلات المحاسبية' },
  { key: 'accounting.manage', module: 'accounting', description: 'إدارة القيود والسندات والضرائب' },
  { key: 'reports.view', module: 'reports', description: 'الاطلاع على التقارير الذكية' },
  { key: 'settings.manage', module: 'settings', description: 'إدارة إعدادات النظام العامة' },
];

export const DEFAULT_ROLES: {
  name: string;
  description: string;
  isSystem: boolean;
  permissionKeys: string[] | 'ALL';
}[] = [
  {
    name: 'Admin',
    description: 'صلاحية كاملة على النظام',
    isSystem: true,
    permissionKeys: 'ALL',
  },
  {
    name: 'Branch Manager',
    description: 'إدارة فرع واحد: مبيعات، مخزون، تقارير، عروض أسعار',
    isSystem: true,
    permissionKeys: [
      'products.view',
      'inventory.view',
      'inventory.manage',
      'purchases.view',
      'purchases.manage',
      'quotations.view',
      'quotations.manage',
      'sales.view',
      'sales.manage',
      'invoices.manage',
      'customers.view',
      'customers.manage',
      'reports.view',
      'audit.view',
    ],
  },
  {
    name: 'Sales',
    description: 'موظف مبيعات ونقاط بيع',
    isSystem: true,
    permissionKeys: [
      'products.view',
      'inventory.view',
      'quotations.view',
      'quotations.manage',
      'sales.view',
      'sales.manage',
      'invoices.manage',
      'customers.view',
      'customers.manage',
    ],
  },
  {
    name: 'Accountant',
    description: 'المحاسبة والفوترة',
    isSystem: true,
    permissionKeys: [
      'accounting.view',
      'accounting.manage',
      'invoices.manage',
      'sales.view',
      'purchases.view',
      'customers.view',
      'suppliers.view',
      'reports.view',
    ],
  },
  {
    name: 'Warehouse',
    description: 'إدارة المخزون والمستودعات',
    isSystem: true,
    permissionKeys: [
      'products.view',
      'products.manage',
      'inventory.view',
      'inventory.manage',
      'purchases.view',
    ],
  },
];
