import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { SettingsService } from '../settings/settings.service';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly settings: SettingsService) {}

  async send(msg: EmailMessage): Promise<void> {
    const provider = await this.settings.get('email.provider', 'console');
    const from = await this.settings.get('email.from');
    try {
      if (provider === 'smtp') return await this.sendSmtp(from, msg);
      if (provider === 'sendgrid') return await this.sendSendgrid(from, msg);
    } catch (e) {
      this.logger.error(`邮件发送失败(${provider})：${(e as Error).message}`);
    }
    // console 兜底（开发/未配置时）
    this.logger.log(`[邮件:console] To=${msg.to} Subject=${msg.subject}\n${msg.html}`);
  }

  private async sendSmtp(from: string, msg: EmailMessage): Promise<void> {
    const host = await this.settings.get('email.smtp.host');
    const port = Number(await this.settings.get('email.smtp.port', '465'));
    const user = await this.settings.get('email.smtp.user');
    const pass = await this.settings.get('email.smtp.pass');
    if (!host) throw new Error('未配置 SMTP host');
    const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: user ? { user, pass } : undefined });
    await transport.sendMail({ from: from || user, to: msg.to, subject: msg.subject, html: msg.html });
    this.logger.log(`[邮件:smtp] 已发送至 ${msg.to}`);
  }

  private async sendSendgrid(from: string, msg: EmailMessage): Promise<void> {
    const apiKey = await this.settings.get('email.sendgrid.apiKey');
    if (!apiKey) throw new Error('未配置 SendGrid apiKey');
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: msg.to }] }],
        from: { email: from },
        subject: msg.subject,
        content: [{ type: 'text/html', value: msg.html }],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid ${res.status}`);
    this.logger.log(`[邮件:sendgrid] 已发送至 ${msg.to}`);
  }
}
