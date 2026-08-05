import type {
  DeliveryRepository,
  DeliveryRow,
} from "../repositories/delivery.repository";
import {
  addDaysIso,
  dayNameIso,
  diffDaysIso,
  eachDayIso,
  startOfWeekIso,
  todayIso,
} from "../utils/date";

interface ListByWeekInput {
  start: string;
  end: string;
}

export class DeliveryService {
  constructor(private repo: DeliveryRepository) {}

  private toDeliveryItem(row: DeliveryRow) {
    return {
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      status: row.status,
      customer: {
        id: row.customerId,
        name: row.customerName,
        phone: row.customerPhone,
      },
      shippingDetail: {
        address: row.shippingAddress,
        city: row.shippingCity,
        province: row.shippingProvince,
        zipCode: row.shippingZipCode,
        timeSlot: row.deliveryTimeSlot,
        notes: row.deliveryNotes,
        trackingNumber: row.trackingNumber,
      },
    };
  }

  async getStats() {
    const today = todayIso();
    const weekOf = startOfWeekIso(today);
    const weekEnd = addDaysIso(weekOf, 6);

    const [thisWeek, overdue] = await Promise.all([
      this.repo.countByDateRange(weekOf, weekEnd),
      this.repo.countOverdue(today),
    ]);

    return { thisWeek, overdue };
  }

  async listByWeek(input: ListByWeekInput) {
    const rows = await this.repo.findByDateRange(input.start, input.end);

    const byDate = new Map<string, DeliveryRow[]>();
    for (const row of rows) {
      const list = byDate.get(row.deliveryDate) ?? [];
      list.push(row);
      byDate.set(row.deliveryDate, list);
    }

    const days = eachDayIso(input.start, input.end).map((date) => ({
      date,
      dayName: dayNameIso(date),
      deliveries: (byDate.get(date) ?? []).map((row) =>
        this.toDeliveryItem(row),
      ),
    }));

    return { date: { start: input.start, end: input.end }, days };
  }

  async listOverdue() {
    const today = todayIso();
    const rows = await this.repo.findOverdue(today);

    return rows.map((row) => ({
      id: row.id,
      date: row.deliveryDate,
      daysOverdue: diffDaysIso(row.deliveryDate, today),
      invoiceNumber: row.invoiceNumber,
      status: row.status,
      customer: {
        id: row.customerId,
        name: row.customerName,
        phone: row.customerPhone,
      },
      city: row.shippingCity,
    }));
  }
}
