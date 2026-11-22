import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health(): { ok: boolean; service: string; time: number } {
    return { ok: true, service: 'zhicang-backend', time: Date.now() };
  }
}
