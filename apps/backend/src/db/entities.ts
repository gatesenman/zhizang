import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserRole = 'user' | 'admin';
export type CodeStatus = 'unused' | 'active' | 'revoked';
export type OrderStatus = 'pending' | 'paid' | 'failed' | 'refunded';

// Postgres 用 timestamp，SQLite 用 datetime
const TS_TYPE = (process.env.DATABASE_URL ? 'timestamp' : 'datetime') as 'timestamp';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index({ unique: true }) @Column() email!: string;
  @Column() passwordHash!: string;
  @Column({ default: 'user' }) role!: UserRole;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('activation_codes')
export class ActivationCode {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index({ unique: true }) @Column() code!: string;
  @Column({ default: 'pro' }) plan!: string;
  @Column({ type: 'int', default: 365 }) durationDays!: number;
  @Column({ type: 'int', default: 1 }) maxDevices!: number;
  @Column({ default: 'unused' }) status!: CodeStatus;
  @Column({ type: 'varchar', nullable: true }) email!: string | null;
  @Column({ type: 'varchar', nullable: true }) orderId!: string | null;
  @Column({ type: 'varchar', nullable: true }) note!: string | null;
  @CreateDateColumn() createdAt!: Date;
  @Column({ type: TS_TYPE, nullable: true }) activatedAt!: Date | null;
}

@Entity('device_bindings')
@Index(['codeId', 'deviceId'], { unique: true })
export class DeviceBinding {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() codeId!: string;
  @Column() deviceId!: string;
  @Column() email!: string;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('settings')
export class Setting {
  @PrimaryColumnText() key!: string;
  @Column({ type: 'text', default: '' }) value!: string;
  @UpdateDateColumn() updatedAt!: Date;
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() name!: string;
  @Column({ default: 'pro' }) plan!: string;
  @Column({ type: 'int' }) priceCents!: number;
  @Column({ default: 'CNY' }) currency!: string;
  @Column({ type: 'int', default: 365 }) durationDays!: number;
  @Column({ type: 'int', default: 1 }) maxDevices!: number;
  @Column({ type: 'varchar', nullable: true }) description!: string | null;
  @Column({ default: true }) active!: boolean;
  @Column({ type: 'int', default: 0 }) sort!: number;
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() productId!: string;
  @Column() email!: string;
  @Column({ type: 'int' }) amountCents!: number;
  @Column({ default: 'CNY' }) currency!: string;
  @Column({ default: 'mock' }) provider!: string;
  @Column({ default: 'pending' }) status!: OrderStatus;
  @Column({ type: 'varchar', nullable: true }) providerRef!: string | null;
  @Column({ type: 'varchar', nullable: true }) codeId!: string | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}

@Entity('tag_dict')
export class TagDict {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index({ unique: true }) @Column() name!: string;
  @Column({ type: 'varchar', nullable: true }) group!: string | null;
  @CreateDateColumn() createdAt!: Date;
}

// 云同步：每个用户(email)一份收藏记录，按 urlHash 唯一
@Entity('sync_items')
@Index(['email', 'urlHash'], { unique: true })
@Index(['email', 'updatedAtMs'])
export class SyncItem {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() email!: string;
  @Column() urlHash!: string;
  @Column({ type: 'text' }) payload!: string; // JSON: SyncPushItem
  @Column({ type: 'bigint' }) updatedAtMs!: string;
  @Column({ default: false }) deleted!: boolean;
}

// 兼容不同数据库的文本主键
function PrimaryColumnText(): PropertyDecorator {
  return Column({ primary: true, type: 'varchar', length: 128 });
}
