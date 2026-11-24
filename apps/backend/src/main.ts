import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || ['change-me-to-a-long-random-string', 'zhicang-dev-secret-change-me'].includes(process.env.JWT_SECRET))) {
    throw new Error('生产同步服务必须配置至少 32 字符的随机 JWT_SECRET');
  }
  const app = await NestFactory.create(AppModule);
  // API 安全响应头；不托管 HTML 或支付页面。
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
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
