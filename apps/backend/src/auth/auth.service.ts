import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../db/entities';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly settings: SettingsService,
  ) {}

  private sign(user: User): { token: string; user: { id: string; email: string; role: string } } {
    const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return { token, user: { id: user.id, email: user.email, role: user.role } };
  }

  // 是否将该邮箱注册为管理员：
  // - 配置了 ADMIN_BOOTSTRAP_EMAILS（逗号分隔白名单）时，仅白名单内邮箱可成为 admin；
  // - 未配置时，回退到「首个注册用户为管理员」（便于本地/演示，但生产建议显式配置白名单）。
  private isAdminEmail(email: string, userCount: number): boolean {
    const list = (process.env.ADMIN_BOOTSTRAP_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (list.length > 0) return list.includes(email.trim().toLowerCase());
    return userCount === 0;
  }

  async register(email: string, password: string) {
    if (!(await this.settings.getBool('login.allowRegister'))) {
      throw new BadRequestException('当前未开放注册');
    }
    const exists = await this.users.findOne({ where: { email } });
    if (exists) throw new BadRequestException('邮箱已注册');
    const count = await this.users.count();
    const user = this.users.create({
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: this.isAdminEmail(email, count) ? 'admin' : 'user',
    });
    await this.users.save(user);
    return this.sign(user);
  }

  async login(email: string, password: string) {
    const user = await this.users.findOne({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('邮箱或密码错误');
    }
    return this.sign(user);
  }

  async verify(token: string): Promise<User> {
    try {
      const payload = this.jwt.verify<{ sub: string }>(token);
      const user = await this.users.findOne({ where: { id: payload.sub } });
      if (!user) throw new Error('not found');
      return user;
    } catch {
      throw new UnauthorizedException('登录已失效');
    }
  }
}
