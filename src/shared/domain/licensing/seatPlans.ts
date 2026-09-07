/** Who is paid for, and what a seat costs.
 *
 * Editions answer "which features"; this answers "how many people". They are deliberately separate:
 * a two-person firm and a fifteen-person firm can both be on Full, and a seat count has nothing to
 * do with whether payroll is unlocked.
 *
 * The price lives here as data, in one place, because the alternative is a number typed into a
 * screen. A figure written into a component is wrong the first time pricing changes and nobody can
 * find every copy of it. Keep these plans in step with the billing catalogue and the Stripe
 * recurring prices — that is the only thing that has to be kept in sync by hand.
 */

export type SeatPlanCode = 'starter' | 'standard' | 'pro';

export interface SeatPlan {
  code: SeatPlanCode;
  label: string;
  /** Seats the plan price covers. */
  includedSeats: number;
  /** What the plan costs per month, in cents, for the included seats. */
  monthlyCents: number;
  /** What one seat beyond the included count adds per month, in cents. */
  additionalSeatMonthlyCents: number;
}

export const SEAT_PLANS: SeatPlan[] = [
  { code: 'starter', label: 'Starter', includedSeats: 2, monthlyCents: 4_900, additionalSeatMonthlyCents: 2_450 },
  { code: 'standard', label: 'Standard', includedSeats: 5, monthlyCents: 8_900, additionalSeatMonthlyCents: 1_780 },
  { code: 'pro', label: 'Pro', includedSeats: 15, monthlyCents: 14_900, additionalSeatMonthlyCents: 993 },
];

const BY_CODE = new Map(SEAT_PLANS.map((plan) => [plan.code, plan]));

/** The plan named in a licence key, or null for a key issued before plans existed. A null plan is
 * not an error: those keys predate seat billing and are treated as unlimited, the same way a key
 * with no edition keeps everything. */
export function seatPlanFromLicense(value: string | null | undefined): SeatPlan | null {
  if (value == null || value === '') return null;
  return BY_CODE.get(value as SeatPlanCode) ?? null;
}

/** How many seats a licence allows. null means no limit — an older key with no seat count, which
 * must keep working exactly as it did before seats were introduced. */
export function licensedSeats(seats: number | null | undefined, plan: SeatPlan | null): number | null {
  if (typeof seats === 'number' && Number.isInteger(seats) && seats > 0) return seats;
  return plan ? plan.includedSeats : null;
}

/** What the customer is paying for `seats` on `plan`, in cents per month. Seats past the plan's
 * included count are charged at the plan's additional-seat rate. */
export function monthlySeatCostCents(seats: number, plan: SeatPlan): number {
  const extra = Math.max(0, seats - plan.includedSeats);
  return plan.monthlyCents + extra * plan.additionalSeatMonthlyCents;
}

/** Seats currently consumed. The workstation administrator is a person using the software, so it
 * counts; a suspended user has no access and does not. A pending invitation does count — the seat
 * is reserved the moment it is handed out, otherwise a firm can invite past its limit and only
 * discover it when everyone accepts at once. */
export function billedSeats(users: { status: 'pending' | 'active' | 'suspended' }[]): number {
  return 1 + users.filter((user) => user.status !== 'suspended').length;
}
