import { describe, expect, it } from 'vitest';
import { billedSeats, licensedSeats, monthlySeatCostCents, seatPlanFromLicense, SEAT_PLANS } from './seatPlans';

describe('seat plans', () => {
  it('leaves a licence issued before seat billing unlimited', () => {
    expect(seatPlanFromLicense(undefined)).toBeNull();
    expect(licensedSeats(undefined, null)).toBeNull();
    expect(licensedSeats(null, seatPlanFromLicense('standard'))).toBe(5);
  });

  it('ignores a seat count that is not a positive whole number', () => {
    const plan = seatPlanFromLicense('starter')!;
    expect(licensedSeats(0, plan)).toBe(plan.includedSeats);
    expect(licensedSeats(-3, plan)).toBe(plan.includedSeats);
    expect(licensedSeats(2.5, plan)).toBe(plan.includedSeats);
    expect(licensedSeats(7, plan)).toBe(7);
  });

  it('charges the plan price up to its included seats, then the extra-seat rate', () => {
    const standard = seatPlanFromLicense('standard')!;
    expect(monthlySeatCostCents(3, standard)).toBe(standard.monthlyCents);
    expect(monthlySeatCostCents(5, standard)).toBe(standard.monthlyCents);
    expect(monthlySeatCostCents(7, standard)).toBe(standard.monthlyCents + 2 * standard.additionalSeatMonthlyCents);
  });

  it('counts the workstation administrator, invitations and active users, but not suspensions', () => {
    expect(billedSeats([])).toBe(1);
    expect(billedSeats([{ status: 'active' }, { status: 'pending' }])).toBe(3);
    expect(billedSeats([{ status: 'active' }, { status: 'suspended' }])).toBe(2);
  });

  it('never prices an extra seat above the plan it belongs to', () => {
    for (const plan of SEAT_PLANS) {
      expect(plan.additionalSeatMonthlyCents).toBeGreaterThan(0);
      expect(plan.additionalSeatMonthlyCents).toBeLessThanOrEqual(plan.monthlyCents);
    }
  });
});
