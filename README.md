# ERP Backend — طبقة الأساس (Foundation)

المرحلة الأولى من نظام الـ ERP السحابي لشركات الأدوات الصحية والسباكة.
تغطي هذه المرحلة: **قاعدة البيانات + المستخدمون + الأدوار والصلاحيات (RBAC) + الفروع + سجل العمليات + المصادقة (JWT + 2FA)**.

الوحدات القادمة (المنتجات، المخزون، المبيعات، المشتريات، المحاسبة، الفوترة الإلكترونية وربط ZATCA...) ستُبنى فوق هذا الأساس في مراحل لاحقة.

## التقنيات
- **NestJS** (Node.js + TypeScript)
- **Prisma ORM** + **PostgreSQL**
- **JWT** (access + refresh قابل للتدوير) + **2FA (TOTP)**
- RBAC ديناميكي (صلاحيات محفوظة في قاعدة البيانات، وليست ثابتة بالكود)

## التشغيل محليًا

### 1) تشغيل قاعدة البيانات
```bash
docker compose up -d
```
هذا يشغّل PostgreSQL على `localhost:5432` بالبيانات الموجودة في `docker-compose.yml`.

### 2) تجهيز المتغيرات
```bash
cp .env.example .env
```
عدّل القيم عند الحاجة (خصوصًا `JWT_ACCESS_SECRET` و`JWT_REFRESH_SECRET` في بيئة الإنتاج).

### 3) تثبيت الحزم
```bash
npm install
```

### 4) توليد Prisma Client وتطبيق المخطط على قاعدة البيانات
```bash
npx prisma generate
npx prisma migrate dev --name init
```
سيسألك عن اسم الـ migration، اكتب مثلًا `init`.

### 5) تعبئة البيانات الأولية (الصلاحيات + الأدوار الافتراضية + فرع رئيسي + حساب Admin)
```bash
npm run prisma:seed
```
سيطبع لك بيانات دخول أول حساب Admin (افتراضيًا `admin` / `ChangeMe123!` — **غيّرها فورًا بعد أول دخول**).

### 6) تشغيل السيرفر
```bash
npm run start:dev
```
السيرفر يعمل على: `http://localhost:3000/api/v1`

## اختبار سريع عبر curl

**تسجيل الدخول:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"usernameOrEmail": "admin", "password": "ChangeMe123!"}'
```
سيرجع `accessToken` و`refreshToken`.

**استخدام التوكن:**
```bash
curl http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer <accessToken>"
```

## نظرة عامة على الصلاحيات (RBAC)

كل صلاحية بصيغة `module.action` مثل `users.manage` أو `invoices.manage`. كل **دور (Role)** يملك مجموعة صلاحيات، وكل **مستخدم** له دور واحد وفرع اختياري.

الأدوار الافتراضية بعد الـ seed: `Admin` (كل الصلاحيات)، `Branch Manager`، `Sales`، `Accountant`، `Warehouse`.

يمكن إدارة الأدوار والصلاحيات بالكامل عبر API (`/roles`) — إضافة دور جديد، تعديل صلاحياته، حذفه (إلا الأدوار النظامية).

## نقاط النهاية (Endpoints) الرئيسية

| المسار | الوصف | الصلاحية المطلوبة |
|---|---|---|
| `POST /auth/login` | تسجيل الدخول (يدعم 2FA) | عام |
| `POST /auth/refresh` | تجديد التوكن | عام |
| `POST /auth/logout` | تسجيل الخروج | مسجّل دخول |
| `GET /auth/me` | بيانات المستخدم الحالي وصلاحياته | مسجّل دخول |
| `POST /auth/2fa/setup` | توليد سر 2FA + رمز QR | مسجّل دخول |
| `POST /auth/2fa/enable` | تفعيل 2FA بعد التحقق من الرمز | مسجّل دخول |
| `POST /auth/2fa/disable` | تعطيل 2FA (يتطلب كلمة المرور) | مسجّل دخول |
| `GET/POST/PATCH/DELETE /users` | إدارة المستخدمين | `users.view` / `users.manage` |
| `GET/POST/PATCH/DELETE /roles` | إدارة الأدوار والصلاحيات | `roles.view` / `roles.manage` |
| `GET /permissions` | قائمة كل الصلاحيات المتاحة (مجمّعة حسب الوحدة) | `roles.view` |
| `GET/POST/PATCH/DELETE /branches` | إدارة الفروع | `branches.view` / `branches.manage` |
| `GET /audit-logs` | سجل العمليات (فلترة حسب المستخدم/المورد/التاريخ) | `audit.view` |

## ملاحظات أمنية مهمة قبل الإنتاج
- غيّر جميع القيم الافتراضية في `.env` (أسرار JWT، بيانات قاعدة البيانات).
- غيّر كلمة مرور حساب الـ Admin الأول مباشرة بعد أول تسجيل دخول.
- فعّل HTTPS أمام السيرفر (reverse proxy مثل Nginx أو Caddy).
- راجع صلاحية CORS في `main.ts` (`app.enableCors()`) وقيّدها للنطاقات الفعلية بدل السماح للجميع.
