import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import type { User } from '../db/entities';

interface AuthedRequest extends Request {
  user?: User;
}

function extractToken(req: Request): string | null {
  const header = req.headers['authorization'];
  if (!header || Array.isArray(header)) return null;
  const [type, token] = header.split(' ');
  return type === 'Bearer' && token ? token : null;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(protected readonly auth: AuthService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = extractToken(req);
    if (!token) throw new UnauthorizedException('未登录');
    req.user = await this.auth.verify(token);
    return true;
  }
}

@Injectable()
export class AdminGuard extends JwtAuthGuard {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    await super.canActivate(ctx);
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (req.user?.role !== 'admin') throw new ForbiddenException('需要管理员权限');
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): User => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user as User;
});
