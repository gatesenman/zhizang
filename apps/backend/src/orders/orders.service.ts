import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../db/entities';

@Injectable()
export class OrdersService {
  constructor(@InjectRepository(Order) private readonly repo: Repository<Order>) {}

  create(data: Partial<Order>): Promise<Order> {
    return this.repo.save(this.repo.create(data));
  }

  async get(id: string): Promise<Order> {
    const order = await this.repo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('订单不存在');
    return order;
  }

  async setStatus(id: string, status: OrderStatus, patch: Partial<Order> = {}): Promise<Order> {
    const order = await this.get(id);
    Object.assign(order, patch, { status });
    return this.repo.save(order);
  }

  listAll(): Promise<Order[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }
}
