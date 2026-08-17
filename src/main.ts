import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  // In production, set CORS_ORIGIN to your real frontend URL(s), comma-separated
  // (e.g. "https://erp.yourcompany.com,https://www.yourcompany.com").
  // Falls back to the local Vite dev server when not set.
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : ['http://localhost:5173'];
  app.enableCors({ origin: corsOrigins });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ERP API — نظام تخطيط موارد المؤسسات')
    .setDescription(
      'توثيق تفاعلي لكل نقاط نهاية الـ API. اضغط "Authorize" فوق وألصق الـ accessToken (بدون كلمة Bearer) لتجربة المسارات المحمية مباشرة من هذي الصفحة.',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

  // Auto-group routes by resource (first meaningful path segment) and require
  // the bearer token everywhere except the two public auth endpoints — done
  // here in one place instead of decorating every controller individually.
  for (const [path, methods] of Object.entries(swaggerDocument.paths)) {
    const segments = path.split('/').filter((s) => s && s !== 'api' && s !== 'v1');
    const tag = segments[0] ?? 'other';
    const isPublic = path.endsWith('/auth/login') || path.endsWith('/auth/refresh');

    for (const operation of Object.values(methods as Record<string, any>)) {
      if (operation && typeof operation === 'object') {
        operation.tags = [tag];
        operation.security = isPublic ? [] : [{ 'access-token': [] }];
      }
    }
  }

  SwaggerModule.setup('docs', app, swaggerDocument);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`ERP backend foundation running on http://localhost:${port}/api/v1`);
  // eslint-disable-next-line no-console
  console.log(`Interactive API docs: http://localhost:${port}/docs`);
}

bootstrap();
