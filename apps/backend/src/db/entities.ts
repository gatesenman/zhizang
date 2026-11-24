import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserRole = 'user' | 'admin';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index({ unique: true }) @Column() email!: string;
  @Column() passwordHash!: string;
  @Column({ default: 'user' }) role!: UserRole;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('settings')
export class Setting {
  @PrimaryColumnText() key!: string;
  @Column({ type: 'text', default: '' }) value!: string;
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
