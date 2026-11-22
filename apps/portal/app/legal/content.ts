import type { Lang } from '@/lib/i18n';

export type LegalSection = { h?: string; p?: string[]; ul?: string[] };
export type LegalContent = { title: string; updated: string; sections: LegalSection[] };
export type LegalDocMap = Record<Lang, LegalContent>;

// 法律文本中的可替换项：运营方在上线前应替换为真实主体与联系方式。
const COMPANY_ZH = '智藏 ZhiCang';
const COMPANY_EN = 'ZhiCang';
const CONTACT = 'support@zhicang.app';
const UPDATED = '2026-06-13';

export const PRIVACY: LegalDocMap = {
  zh: {
    title: '隐私政策',
    updated: UPDATED,
    sections: [
      {
        p: [
          `${COMPANY_ZH}（以下简称"我们"）尊重并保护你的隐私。本政策说明我们在你使用桌面客户端、购买门户及相关服务时如何收集、使用与保护信息。`,
        ],
      },
      {
        h: '我们收集的信息',
        ul: [
          '账户与订单信息：购买时你提供的邮箱地址，用于发送激活码并与许可证绑定。',
          '授权与设备信息：用于离线许可校验的设备指纹（对设备名等本地标识做单向哈希），以及激活码、设备数量等授权状态。',
          '支付信息：支付由第三方支付机构（Stripe / 支付宝 / 微信支付）处理，我们不存储你的银行卡或支付账户密码。',
          '本地数据：你的收藏、分类、标签、快照等数据默认仅保存在你本机的本地数据库中。',
        ],
      },
      {
        h: '信息如何使用',
        ul: [
          '完成下单、发码、激活与售后；',
          '校验授权状态、限制设备数量、防止滥用；',
          '在你主动开启云同步时，按你的配置在你指定的服务端之间同步数据。',
        ],
      },
      {
        h: '本地优先与数据存储',
        p: [
          '本产品采用本地优先设计：收藏内容默认存储在你的设备上。仅当你主动配置并开启云同步时，相关数据才会上传到你指定的同步服务端。',
        ],
      },
      {
        h: '第三方服务',
        ul: [
          '支付：Stripe、支付宝、微信支付，用于收款与回调履约；',
          '邮件：用于发送激活码的邮件服务（如 SMTP / SendGrid）；',
          'AI 能力：AI 富化与问答会将必要内容发送至你所配置的大模型服务商（默认 DeepSeek）。API Key 由你自行提供并保存在本地。',
        ],
      },
      {
        h: '数据安全',
        p: [
          '我们采用合理的技术与管理措施保护信息，包括传输加密、访问令牌、限流与安全响应头等。但请理解任何系统都无法保证绝对安全。',
        ],
      },
      {
        h: '你的权利',
        p: [`你有权访问、更正或删除你的个人信息。如需协助，请通过 ${CONTACT} 联系我们。`],
      },
      {
        h: '联系我们',
        p: [`如对本隐私政策有任何疑问，请联系：${CONTACT}`],
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    updated: UPDATED,
    sections: [
      {
        p: [
          `${COMPANY_EN} ("we", "us") respects and protects your privacy. This policy explains how we collect, use and protect information when you use the desktop app, the purchase portal and related services.`,
        ],
      },
      {
        h: 'Information we collect',
        ul: [
          'Account & order data: the email you provide at purchase, used to deliver the activation code and bind it to your license.',
          'License & device data: a device fingerprint used for offline license verification (a one-way hash of local identifiers such as the device name), plus activation codes and device-count status.',
          'Payment data: payments are processed by third-party providers (Stripe / Alipay / WeChat Pay). We do not store your card numbers or payment passwords.',
          'Local data: your bookmarks, categories, tags and snapshots are stored only in the local database on your own device by default.',
        ],
      },
      {
        h: 'How we use information',
        ul: [
          'To complete checkout, deliver codes, handle activation and support;',
          'To verify license status, enforce device limits and prevent abuse;',
          'To sync data between the endpoints you configure, only when you enable cloud sync.',
        ],
      },
      {
        h: 'Local-first storage',
        p: [
          'This product is local-first: your bookmark content is stored on your device by default. Data is uploaded only to the sync endpoint you configure, and only when you explicitly enable cloud sync.',
        ],
      },
      {
        h: 'Third-party services',
        ul: [
          'Payments: Stripe, Alipay and WeChat Pay for charging and fulfillment callbacks;',
          'Email: an email service (e.g. SMTP / SendGrid) used to deliver activation codes;',
          'AI features: AI enrichment and Q&A send the necessary content to the LLM provider you configure (DeepSeek by default). Your API key is provided by you and stored locally.',
        ],
      },
      {
        h: 'Data security',
        p: [
          'We apply reasonable technical and organizational measures, including transport encryption, access tokens, rate limiting and security headers. However, no system can guarantee absolute security.',
        ],
      },
      {
        h: 'Your rights',
        p: [`You may access, correct or delete your personal information. For help, contact us at ${CONTACT}.`],
      },
      {
        h: 'Contact us',
        p: [`For any questions about this Privacy Policy, contact: ${CONTACT}`],
      },
    ],
  },
};

export const EULA: LegalDocMap = {
  zh: {
    title: '最终用户许可协议（EULA）',
    updated: UPDATED,
    sections: [
      {
        p: [
          `本协议是你与 ${COMPANY_ZH} 之间就本软件（桌面客户端及相关服务）使用所达成的法律协议。购买、激活或使用本软件即表示你同意本协议。`,
        ],
      },
      {
        h: '许可授予',
        p: [
          '在你遵守本协议的前提下，我们授予你一项非独占、不可转让的许可，可在所购方案允许的设备数量范围内安装和使用本软件。',
        ],
      },
      {
        h: '激活与设备绑定',
        p: [
          '激活码与购买邮箱绑定，并按方案限制可激活的设备数量。激活码不得公开分享或转售。超出设备数量需另行购买或停用其他设备。',
        ],
      },
      {
        h: '使用限制',
        ul: [
          '不得对软件进行反向工程、反编译或试图绕过授权校验；',
          '不得分发、转售、出租软件或激活码，或移除版权与品牌标识；',
          '不得将软件用于任何违法用途。',
        ],
      },
      {
        h: '知识产权',
        p: ['本软件的全部知识产权归我们或相应权利人所有。本协议仅授予使用许可，并不转让任何权利。'],
      },
      {
        h: '第三方与 AI 生成内容',
        p: [
          '软件可调用你所配置的第三方服务（如大模型）。AI 生成的描述、标签或回答可能存在不准确之处，仅供参考，你应自行判断其适用性。',
        ],
      },
      {
        h: '免责声明',
        p: ['本软件按"现状"提供，在法律允许的最大范围内，我们不对适销性、特定用途适用性作出明示或默示担保。'],
      },
      {
        h: '责任限制',
        p: ['在法律允许的最大范围内，我们不对任何间接、偶然或后果性损失承担责任；我们的累计责任不超过你为本软件支付的金额。'],
      },
      {
        h: '终止',
        p: ['若你违反本协议，相关授权可被终止。终止后你应停止使用并删除软件。'],
      },
      {
        h: '联系',
        p: [`如对本协议有疑问，请联系：${CONTACT}`],
      },
    ],
  },
  en: {
    title: 'End User License Agreement (EULA)',
    updated: UPDATED,
    sections: [
      {
        p: [
          `This Agreement is a legal contract between you and ${COMPANY_EN} regarding your use of the Software (the desktop app and related services). By purchasing, activating or using the Software, you agree to this Agreement.`,
        ],
      },
      {
        h: 'License grant',
        p: [
          'Subject to your compliance with this Agreement, we grant you a non-exclusive, non-transferable license to install and use the Software on the number of devices permitted by your plan.',
        ],
      },
      {
        h: 'Activation & device binding',
        p: [
          'The activation code is bound to your purchase email and limits the number of devices per your plan. Codes may not be publicly shared or resold. Exceeding the device limit requires an additional purchase or deactivating other devices.',
        ],
      },
      {
        h: 'Restrictions',
        ul: [
          'Do not reverse engineer, decompile, or attempt to bypass license verification;',
          'Do not distribute, resell, or rent the Software or activation codes, or remove copyright and branding;',
          'Do not use the Software for any unlawful purpose.',
        ],
      },
      {
        h: 'Intellectual property',
        p: ['All intellectual property in the Software belongs to us or the respective rights holders. This Agreement grants a license to use only and transfers no ownership.'],
      },
      {
        h: 'Third-party & AI-generated content',
        p: [
          'The Software may call third-party services you configure (such as LLMs). AI-generated descriptions, tags or answers may be inaccurate and are provided for reference only; you are responsible for judging their suitability.',
        ],
      },
      {
        h: 'Disclaimer of warranty',
        p: ['The Software is provided "as is". To the maximum extent permitted by law, we disclaim all express or implied warranties, including merchantability and fitness for a particular purpose.'],
      },
      {
        h: 'Limitation of liability',
        p: ['To the maximum extent permitted by law, we are not liable for any indirect, incidental or consequential damages; our aggregate liability shall not exceed the amount you paid for the Software.'],
      },
      {
        h: 'Termination',
        p: ['Your license may be terminated if you breach this Agreement. Upon termination you must stop using and delete the Software.'],
      },
      {
        h: 'Contact',
        p: [`For questions about this Agreement, contact: ${CONTACT}`],
      },
    ],
  },
};

export const REFUND: LegalDocMap = {
  zh: {
    title: '退款政策',
    updated: UPDATED,
    sections: [
      {
        p: ['我们希望你满意。由于激活码属于数字商品，退款政策如下。'],
      },
      {
        h: '可退款情形',
        ul: [
          '激活码尚未被激活（未在任何设备上使用）：自购买之日起 14 天内可申请全额退款；',
          '因技术故障导致无法正常激活或使用，且我们无法在合理时间内解决。',
        ],
      },
      {
        h: '不可退款情形',
        ul: [
          '激活码已被激活（已在设备上解锁使用）；',
          '超过 14 天退款时限；',
          '因违反用户协议导致授权被终止。',
        ],
      },
      {
        h: '如何申请',
        p: [`请通过 ${CONTACT} 联系我们，并提供购买邮箱与订单号。我们会在 3 个工作日内回复。`],
      },
      {
        h: '处理时间',
        p: ['退款经核实后将原路退回至你的支付渠道，到账时间取决于支付机构（通常为 5–10 个工作日）。'],
      },
    ],
  },
  en: {
    title: 'Refund Policy',
    updated: UPDATED,
    sections: [
      {
        p: ['We want you to be satisfied. Because activation codes are digital goods, our refund policy is as follows.'],
      },
      {
        h: 'Eligible for refund',
        ul: [
          'The activation code has not been activated (not used on any device): full refund within 14 days of purchase;',
          'A technical fault prevents activation or use and we cannot resolve it within a reasonable time.',
        ],
      },
      {
        h: 'Not eligible for refund',
        ul: [
          'The activation code has already been activated (unlocked on a device);',
          'More than 14 days have passed since purchase;',
          'The license was terminated due to a breach of the EULA.',
        ],
      },
      {
        h: 'How to request',
        p: [`Contact us at ${CONTACT} with your purchase email and order id. We will reply within 3 business days.`],
      },
      {
        h: 'Processing time',
        p: ['Once verified, refunds are returned to your original payment method; arrival depends on the payment provider (typically 5–10 business days).'],
      },
    ],
  },
};
