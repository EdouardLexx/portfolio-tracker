import type { Loan } from '../types'

export interface LoanInstallment {
  index: number
  date: string
  phase: 'deferral' | 'repayment'
  /** Paid to the lender, insurance excluded. */
  paymentEUR: number
  interestEUR: number
  principalEUR: number
  /** Interest added to the capital instead of being paid (total deferral). */
  capitalizedEUR: number
  insuranceEUR: number
  /** Capital still owed once this installment is settled. */
  remainingEUR: number
}

export interface LoanStatus {
  /** False until the funds arrive. */
  started: boolean
  remainingEUR: number
  principalRepaidEUR: number
  /** Interest actually paid so far; capitalised interest is repaid as capital. */
  interestPaidEUR: number
  insurancePaidEUR: number
  paidCount: number
  leftCount: number
  next: LoanInstallment | null
  endDate: string
  /** Installment of the repayment phase, insurance excluded. */
  regularPaymentEUR: number
  /** Everything repaid beyond the borrowed capital, capitalised interest included. */
  totalInterestEUR: number
  totalInsuranceEUR: number
  totalCostEUR: number
}

const cents = (x: number) => Math.round(x * 100) / 100

/** Capital owed across all loans on `date`. */
export function totalDebtOn(
  loans: { loan: Loan; schedule: LoanInstallment[] }[],
  date: string
): number {
  return cents(loans.reduce((sum, l) => sum + debtOn(l.loan, l.schedule, date), 0))
}

/** Same day each month, clamped to the month's end (31 Jan + 1 → 28/29 Feb). */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return target.toISOString().slice(0, 10)
}

/**
 * Constant installment ("échéances constantes") repaying `balance` over
 * `months`. The monthly rate is the nominal annual rate divided by 12: the
 * proportional convention French lenders apply to fixed-rate loans.
 */
export function constantPayment(
  balance: number,
  monthlyRate: number,
  months: number
): number {
  if (months <= 0) return 0
  if (monthlyRate === 0) return cents(balance / months)
  return cents(
    (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
  )
}

/** Months of deferral that actually apply: none for a bullet loan, and at
 *  least one month is always left to repay the capital. */
export function effectiveDeferral(loan: Loan): number {
  if (loan.repayment === 'bullet' || loan.deferral === 'none') return 0
  return Math.max(0, Math.min(loan.deferralMonths, loan.durationMonths - 1))
}

/**
 * Month-by-month schedule. Interest is rounded to the cent each month and the
 * last installment settles whatever rounding left over, as lenders do.
 */
export function buildLoanSchedule(loan: Loan): LoanInstallment[] {
  const rate = loan.annualRatePercent / 100 / 12
  const deferral = effectiveDeferral(loan)
  const installments: LoanInstallment[] = []
  let balance = loan.principalEUR
  let payment = 0

  for (let i = 1; i <= loan.durationMonths; i++) {
    const date = addMonths(loan.startDate, i)
    const interest = cents(balance * rate)
    const insurance = loan.insuranceMonthlyEUR

    if (i <= deferral) {
      const total = loan.deferral === 'total'
      if (total) balance = cents(balance + interest)
      installments.push({
        index: i,
        date,
        phase: 'deferral',
        paymentEUR: total ? 0 : interest,
        interestEUR: interest,
        principalEUR: 0,
        capitalizedEUR: total ? interest : 0,
        insuranceEUR: insurance,
        remainingEUR: balance,
      })
      continue
    }

    const isLast = i === loan.durationMonths
    let principal: number
    if (loan.repayment === 'bullet') {
      principal = isLast ? balance : 0
    } else {
      // Computed once the deferral is over, on the capital it left behind.
      if (i === deferral + 1) {
        payment = constantPayment(balance, rate, loan.durationMonths - deferral)
      }
      principal = isLast ? balance : Math.min(balance, cents(payment - interest))
    }

    balance = cents(balance - principal)
    installments.push({
      index: i,
      date,
      phase: 'repayment',
      paymentEUR: cents(interest + principal),
      interestEUR: interest,
      principalEUR: principal,
      capitalizedEUR: 0,
      insuranceEUR: insurance,
      remainingEUR: balance,
    })
  }

  return installments
}

/** Capital owed on `date`: nothing before the funds arrive, nothing once repaid. */
export function debtOn(
  loan: Loan,
  schedule: LoanInstallment[],
  date: string
): number {
  if (date < loan.startDate) return 0
  let remaining = loan.principalEUR
  for (const installment of schedule) {
    if (installment.date > date) break
    remaining = installment.remainingEUR
  }
  return remaining
}

export function loanStatus(
  loan: Loan,
  schedule: LoanInstallment[],
  today: string
): LoanStatus {
  const paid = schedule.filter((s) => s.date <= today)
  const sum = (list: LoanInstallment[], pick: (s: LoanInstallment) => number) =>
    cents(list.reduce((total, s) => total + pick(s), 0))

  const totalPaid = sum(schedule, (s) => s.paymentEUR)
  const totalInterestEUR = cents(totalPaid - loan.principalEUR)
  const totalInsuranceEUR = sum(schedule, (s) => s.insuranceEUR)
  const firstRepayment = schedule.find((s) => s.phase === 'repayment')

  return {
    started: today >= loan.startDate,
    remainingEUR: paid.length ? paid[paid.length - 1].remainingEUR : loan.principalEUR,
    principalRepaidEUR: sum(paid, (s) => s.principalEUR),
    interestPaidEUR: sum(paid, (s) => s.interestEUR - s.capitalizedEUR),
    insurancePaidEUR: sum(paid, (s) => s.insuranceEUR),
    paidCount: paid.length,
    leftCount: schedule.length - paid.length,
    next: schedule[paid.length] ?? null,
    endDate: schedule.length ? schedule[schedule.length - 1].date : loan.startDate,
    regularPaymentEUR: firstRepayment?.paymentEUR ?? 0,
    totalInterestEUR,
    totalInsuranceEUR,
    totalCostEUR: cents(totalInterestEUR + totalInsuranceEUR + loan.feesEUR),
  }
}

/**
 * Gap between the computed installment and the one the lender states, when
 * it is larger than rounding can explain. A typo in the rate, the duration or
 * the deferral shows up here first.
 */
export function paymentMismatch(loan: Loan, status: LoanStatus): number | null {
  if (loan.bankPaymentEUR == null || loan.repayment === 'bullet') return null
  const gap = cents(status.regularPaymentEUR - loan.bankPaymentEUR)
  return Math.abs(gap) > 0.05 ? gap : null
}
