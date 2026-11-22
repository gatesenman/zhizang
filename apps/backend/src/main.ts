import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // 安全响应头（API 服务，关闭 CSP 以免影响 mock 收银台内联样式）
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  // CORS 来源：配置 CORS_ORIGINS（逗号分隔）则按白名单收紧；留空则放行任意来源（便于本地/桌面端）。
  // 桌面端等原生客户端不带 Origin，始终放行。
  const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, process.env.HOST || '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`[zhicang-backend] listening on http://localhost:${port}/api`);
}

void bootstrap();
