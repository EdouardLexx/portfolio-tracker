import { useMemo, useRef, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import type { Loan, LoanDeferral, LoanKind, LoanRepayment } from '../types'
import { LOAN_KINDS } from '../types'
import {
  buildLoanSchedule,
  effectiveDeferral,
  loanStatus,
  localToday,
  paymentMismatch,
  type LoanInstallment,
  type LoanStatus,
} from '../utils/loans'
import { formatCompactEUR, formatEUR, formatNumber } from '../utils/formatters'
import { useIsDark, chartTheme } from '../hooks/useTheme'

interface LoansPageProps {
  loans: Loan[]
  saveLoan: (loan: Loan) => boolean
  removeLoan: (id: string) => void
}

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatMonths(months: number): string {
  const years = Math.floor(months / 12)
  const rest = months % 12
  if (!years) return `${rest} mois`
  const y = `${years} an${years > 1 ? 's' : ''}`
  return rest ? `${y} et ${rest} mois` : y
}

const parseNumber = (v: string) => parseFloat(v.replace(',', '.').replace(/\s/g, ''))

const kindLabel = (kind: LoanKind) =>
  LOAN_KINDS.find((k) => k.kind === kind)?.label ?? 'Prêt'

// ---------------------------------------------------------------------------
// Form

interface FormState {
  name: string
  kind: LoanKind
  lender: string
  principal: string
  rate: string
  duration: string
  startDate: string
  repayment: LoanRepayment
  deferral: LoanDeferral
  deferralMonths: string
  insurance: string
  fees: string
  bankPayment: string
}

const EMPTY_FORM: FormState = {
  name: '',
  kind: 'student',
  lender: '',
  principal: '',
  rate: '',
  duration: '',
  startDate: '',
  repayment: 'amortizing',
  deferral: 'none',
  deferralMonths: '',
  insurance: '',
  fees: '',
  bankPayment: '',
}

function toForm(loan: Loan): FormState {
  const text = (n: number) => String(n).replace('.', ',')
  return {
    name: loan.name,
    kind: loan.kind,
    lender: loan.lender,
    principal: text(loan.principalEUR),
    rate: text(loan.annualRatePercent),
    duration: String(loan.durationMonths),
    startDate: loan.startDate,
    repayment: loan.repayment,
    deferral: loan.deferral,
    deferralMonths: loan.deferral === 'none' ? '' : String(loan.deferralMonths),
    insurance: loan.insuranceMonthlyEUR ? text(loan.insuranceMonthlyEUR) : '',
    fees: loan.feesEUR ? text(loan.feesEUR) : '',
    bankPayment: loan.bankPaymentEUR != null ? text(loan.bankPaymentEUR) : '',
  }
}

/** Builds the loan, or explains the first field that stops it. */
function fromForm(form: FormState, id: string): Loan | string {
  const principal = parseNumber(form.principal)
  const rate = parseNumber(form.rate)
  const duration = Number(form.duration)
  const hasDeferral = form.repayment === 'amortizing' && form.deferral !== 'none'
  const deferralMonths = hasDeferral ? Number(form.deferralMonths) : 0
  const insurance = form.insurance.trim() ? parseNumber(form.insurance) : 0
  const fees = form.fees.trim() ? parseNumber(form.fees) : 0
  const bankPayment = form.bankPayment.trim() ? parseNumber(form.bankPayment) : null

  if (!form.name.trim()) return 'Donne un nom à ce prêt.'
  if (!(principal > 0)) return 'Indique le montant emprunté.'
  if (!Number.isFinite(rate) || rate < 0 || rate >= 30) {
    return 'Indique le taux nominal annuel, en pourcentage (0 pour un prêt à taux zéro).'
  }
  if (!Number.isInteger(duration) || duration < 1 || duration > 480) {
    return 'Indique la durée totale en mois (entre 1 et 480).'
  }
  if (!form.startDate) return 'Indique la date de déblocage des fonds.'
  if (hasDeferral && (!Number.isInteger(deferralMonths) || deferralMonths < 1)) {
    return 'Indique la durée du différé en mois.'
  }
  if (hasDeferral && deferralMonths >= duration) {
    return 'Le différé doit être plus court que la durée totale du prêt.'
  }
  if (!Number.isFinite(insurance) || insurance < 0) return 'Assurance : montant invalide.'
  if (!Number.isFinite(fees) || fees < 0) return 'Frais : montant invalide.'
  if (bankPayment != null && !(bankPayment > 0)) return 'Mensualité de la banque : montant invalide.'

  return {
    id,
    name: form.name.trim(),
    kind: form.kind,
    lender: form.lender.trim(),
    principalEUR: principal,
    annualRatePercent: rate,
    durationMonths: duration,
    startDate: form.startDate,
    repayment: form.repayment,
    deferral: hasDeferral ? form.deferral : 'none',
    deferralMonths,
    insuranceMonthlyEUR: insurance,
    feesEUR: fees,
    bankPaymentEUR: bankPayment,
  }
}

const inputClass =
  'w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-900'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{label}</span>
      {children}
      {hint && (
        <span className="text-xs text-gray-400 dark:text-gray-500 block mt-1">{hint}</span>
      )}
    </label>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="sm:col-span-2 lg:col-span-4 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mt-2">
      {children}
    </h4>
  )
}

function LoanForm({
  initial,
  editing,
  onSubmit,
  onCancel,
}: {
  initial: FormState
  editing: boolean
  onSubmit: (form: FormState) => string | null
  onCancel: () => void
}) {
  const [form, setForm] = useState<FormState>(initial)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  // Live preview, so a wrong rate or duration shows before saving.
  const preview = useMemo(() => {
    const loan = fromForm(form, 'preview')
    if (typeof loan === 'string') return null
    const schedule = buildLoanSchedule(loan)
    const status = loanStatus(loan, schedule, localToday())
    return { loan, status, mismatch: paymentMismatch(loan, status) }
  }, [form])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const failure = onSubmit(form)
    setError(failure)
    if (!failure && !editing) setForm(EMPTY_FORM)
  }

  const amortizing = form.repayment === 'amortizing'

  return (
    <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <SectionTitle>Le prêt</SectionTitle>
      <Field label="Nom">
        <input
          className={inputClass}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="ex. Prêt étudiant"
        />
      </Field>
      <Field label="Type">
        <select
          className={inputClass}
          value={form.kind}
          onChange={(e) => set('kind', e.target.value as LoanKind)}
        >
          {LOAN_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Organisme prêteur" hint="facultatif">
        <input
          className={inputClass}
          value={form.lender}
          onChange={(e) => set('lender', e.target.value)}
        />
      </Field>
      <Field label="Date de déblocage des fonds" hint="le jour où l'argent a été reçu">
        <input
          type="date"
          className={inputClass}
          value={form.startDate}
          onChange={(e) => set('startDate', e.target.value)}
        />
      </Field>

      <SectionTitle>Conditions</SectionTitle>
      <Field label="Montant emprunté (€)">
        <input
          inputMode="decimal"
          className={inputClass}
          value={form.principal}
          onChange={(e) => set('principal', e.target.value)}
        />
      </Field>
      <Field label="Taux nominal annuel (%)" hint="hors assurance, pas le TAEG">
        <input
          inputMode="decimal"
          className={inputClass}
          value={form.rate}
          onChange={(e) => set('rate', e.target.value)}
        />
      </Field>
      <Field
        label="Durée totale (mois)"
        hint={
          Number(form.duration) > 0
            ? `${formatMonths(Number(form.duration))}, différé compris`
            : 'différé compris'
        }
      >
        <input
          inputMode="numeric"
          className={inputClass}
          value={form.duration}
          onChange={(e) => set('duration', e.target.value)}
        />
      </Field>
      <Field label="Remboursement">
        <select
          className={inputClass}
          value={form.repayment}
          onChange={(e) => set('repayment', e.target.value as LoanRepayment)}
        >
          <option value="amortizing">Échéances constantes</option>
          <option value="bullet">In fine (capital à la fin)</option>
        </select>
      </Field>

      {amortizing && (
        <>
          <SectionTitle>Différé</SectionTitle>
          <Field label="Type de différé">
            <select
              className={inputClass}
              value={form.deferral}
              onChange={(e) => set('deferral', e.target.value as LoanDeferral)}
            >
              <option value="none">Aucun</option>
              <option value="partial">Partiel : intérêts seuls</option>
              <option value="total">Total : rien à payer</option>
            </select>
          </Field>
          {form.deferral !== 'none' && (
            <Field
              label="Durée du différé (mois)"
              hint={
                form.deferral === 'total'
                  ? 'les intérêts s’ajoutent au capital'
                  : 'seuls les intérêts sont payés'
              }
            >
              <input
                inputMode="numeric"
                className={inputClass}
                value={form.deferralMonths}
                onChange={(e) => set('deferralMonths', e.target.value)}
              />
            </Field>
          )}
        </>
      )}

      <SectionTitle>Frais</SectionTitle>
      <Field label="Assurance emprunteur (€/mois)" hint="facultatif">
        <input
          inputMode="decimal"
          className={inputClass}
          value={form.insurance}
          onChange={(e) => set('insurance', e.target.value)}
        />
      </Field>
      <Field label="Frais de dossier et garantie (€)" hint="facultatif, payés une fois">
        <input
          inputMode="decimal"
          className={inputClass}
          value={form.fees}
          onChange={(e) => set('fees', e.target.value)}
        />
      </Field>
      <Field
        label="Mensualité selon la banque (€)"
        hint="facultatif, hors assurance : sert à vérifier la saisie"
      >
        <input
          inputMode="decimal"
          className={inputClass}
          value={form.bankPayment}
          onChange={(e) => set('bankPayment', e.target.value)}
        />
      </Field>

      <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-3 pt-2">
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 dark:bg-violet-500 text-white dark:text-gray-900 hover:bg-violet-700 dark:hover:bg-violet-400"
        >
          {editing ? 'Enregistrer les modifications' : 'Ajouter l’emprunt'}
        </button>
        {editing && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Annuler
          </button>
        )}
        {preview && (
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {preview.loan.repayment === 'bullet' ? 'Intérêts mensuels' : 'Mensualité calculée'}
            {effectiveDeferral(preview.loan) > 0 ? ' après le différé' : ''} :{' '}
            <strong className="text-gray-900 dark:text-gray-100">
              {formatEUR(preview.status.regularPaymentEUR)}
            </strong>
            {preview.loan.insuranceMonthlyEUR > 0 &&
              ` + ${formatEUR(preview.loan.insuranceMonthlyEUR)} d’assurance`}
          </span>
        )}
      </div>

      {preview?.mismatch != null && (
        <p className="sm:col-span-2 lg:col-span-4 text-sm rounded-lg px-4 py-3 bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
          Le calcul donne {formatEUR(preview.status.regularPaymentEUR)}, ta banque indique{' '}
          {formatEUR(preview.loan.bankPaymentEUR ?? 0)}. Vérifie le taux, la durée et le
          différé ; la mensualité de la banque doit être saisie hors assurance.
        </p>
      )}
      {error && (
        <p className="sm:col-span-2 lg:col-span-4 text-sm rounded-lg px-4 py-3 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </form>
  )
}

// ---------------------------------------------------------------------------
// One loan

function Stat({
  label,
  value,
  sub,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function currentPhase(
  loan: Loan,
  schedule: LoanInstallment[],
  status: LoanStatus
): string | null {
  if (!status.started) return `Fonds débloqués le ${formatDay(loan.startDate)}.`
  if (status.next?.phase !== 'deferral') return null
  const deferralEnd = schedule.filter((s) => s.phase === 'deferral').pop()?.date
  const until = deferralEnd ? ` jusqu’au ${formatDay(deferralEnd)}` : ''
  return loan.deferral === 'total'
    ? `En différé total${until} : rien à payer, les intérêts s’ajoutent au capital.`
    : `En différé partiel${until} : seuls les intérêts sont payés.`
}

function LoanCard({
  loan,
  today,
  onEdit,
  onRemove,
}: {
  loan: Loan
  today: string
  onEdit: () => void
  onRemove: () => void
}) {
  const theme = chartTheme(useIsDark())
  const [confirmRemove, setConfirmRemove] = useState(false)
  const schedule = useMemo(() => buildLoanSchedule(loan), [loan])
  const status = useMemo(() => loanStatus(loan, schedule, today), [loan, schedule, today])
  const mismatch = paymentMismatch(loan, status)
  const phase = currentPhase(loan, schedule, status)

  const owed = status.principalRepaidEUR + status.remainingEUR
  const progress = owed > 0 ? (status.principalRepaidEUR / owed) * 100 : 0
  const curve = [{ date: loan.startDate, remainingEUR: loan.principalEUR }, ...schedule]
  const deferral = effectiveDeferral(loan)

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{loan.name}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {kindLabel(loan.kind)}
            {loan.lender && ` · ${loan.lender}`} · {formatNumber(loan.annualRatePercent)} % sur{' '}
            {formatMonths(loan.durationMonths)}
            {loan.repayment === 'bullet' && ', in fine'}
            {deferral > 0 &&
              `, dont ${deferral} mois de différé ${loan.deferral === 'total' ? 'total' : 'partiel'}`}
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          {confirmRemove ? (
            <>
              <span className="text-gray-600 dark:text-gray-400 self-center">Supprimer ce prêt ?</span>
              <button
                onClick={onRemove}
                className="px-3 py-1.5 rounded-lg bg-red-600 dark:bg-red-500 text-white dark:text-gray-900"
              >
                Supprimer
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                className="px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Annuler
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onEdit}
                className="px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Modifier
              </button>
              <button
                onClick={() => setConfirmRemove(true)}
                className="px-3 py-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
              >
                Supprimer
              </button>
            </>
          )}
        </div>
      </div>

      {phase && (
        <p className="text-sm rounded-lg px-4 py-3 bg-violet-50 dark:bg-violet-950 text-violet-800 dark:text-violet-300">
          {phase}
        </p>
      )}

      <div>
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
          <span>Capital remboursé</span>
          <span className="tabular-nums">{formatNumber(progress, 1)} %</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-violet-500 dark:bg-violet-400"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
        <Stat
          label="Capital restant dû"
          value={formatEUR(status.remainingEUR)}
          sub={`sur ${formatEUR(loan.principalEUR)} empruntés`}
        />
        <Stat
          label="Déjà remboursé"
          value={formatEUR(status.principalRepaidEUR)}
          sub={`+ ${formatEUR(status.interestPaidEUR)} d’intérêts payés`}
        />
        <Stat
          label={loan.repayment === 'bullet' ? 'Intérêts mensuels' : 'Mensualité'}
          value={formatEUR(status.regularPaymentEUR)}
          sub={
            loan.insuranceMonthlyEUR > 0
              ? `+ ${formatEUR(loan.insuranceMonthlyEUR)} d’assurance`
              : 'hors assurance'
          }
        />
        <Stat
          label="Échéances restantes"
          value={status.leftCount}
          sub={
            status.leftCount
              ? `dernière le ${formatDay(status.endDate)}`
              : `terminé le ${formatDay(status.endDate)}`
          }
        />
        <Stat
          label="Prochaine échéance"
          value={status.next ? formatEUR(status.next.paymentEUR + status.next.insuranceEUR) : '—'}
          sub={status.next ? `le ${formatDay(status.next.date)}, assurance comprise` : 'prêt remboursé'}
        />
        <Stat
          label="Coût total du crédit"
          value={formatEUR(status.totalCostEUR)}
          sub={`intérêts ${formatEUR(status.totalInterestEUR)} · assurance ${formatEUR(
            status.totalInsuranceEUR
          )} · frais ${formatEUR(loan.feesEUR)}`}
        />
      </div>

      {mismatch != null && (
        <p className="text-sm rounded-lg px-4 py-3 bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
          La mensualité calculée ({formatEUR(status.regularPaymentEUR)}) ne correspond pas à celle
          indiquée par ta banque ({formatEUR(loan.bankPaymentEUR ?? 0)}). Vérifie le taux, la
          durée et le différé : les chiffres ci-dessus en dépendent.
        </p>
      )}

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={curve}>
          <defs>
            <linearGradient id={`owed-${loan.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: theme.tick }}
            tickFormatter={(v: string) =>
              new Date(`${v}T00:00:00Z`).toLocaleDateString('fr-FR', {
                timeZone: 'UTC',
                month: 'short',
                year: '2-digit',
              })
            }
            minTickGap={50}
          />
          <YAxis
            tick={{ fontSize: 12, fill: theme.tick }}
            tickFormatter={(v: number) => formatCompactEUR(v)}
            width={80}
          />
          <Tooltip
            labelFormatter={(v: string) => formatDay(v)}
            formatter={(value: number) => [formatEUR(value), 'Capital restant dû']}
            contentStyle={theme.tooltip}
          />
          {today >= loan.startDate && today <= status.endDate && (
            <ReferenceLine
              x={status.next?.date ?? status.endDate}
              stroke={theme.muted}
              strokeDasharray="4 4"
              label={{ value: 'prochaine', fill: theme.muted, fontSize: 11, position: 'top' }}
            />
          )}
          <Area
            type="stepAfter"
            dataKey="remainingEUR"
            stroke="#8b5cf6"
            strokeWidth={2}
            fill={`url(#owed-${loan.id})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      <Schedule schedule={schedule} today={today} />
    </div>
  )
}

function Schedule({ schedule, today }: { schedule: LoanInstallment[]; today: string }) {
  const cell = 'px-3 py-1.5 text-right tabular-nums whitespace-nowrap'
  return (
    <details className="group">
      <summary className="cursor-pointer text-sm font-medium text-violet-700 dark:text-violet-400 select-none">
        Échéancier complet ({schedule.length} échéances)
      </summary>
      <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-gray-100 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-3 py-2 text-left">N°</th>
              <th className="px-3 py-2 text-left">Date</th>
              <th className={cell}>Échéance</th>
              <th className={cell}>Intérêts</th>
              <th className={cell}>Capital</th>
              <th className={cell}>Assurance</th>
              <th className={cell}>Restant dû</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {schedule.map((s) => (
              <tr
                key={s.index}
                className={
                  s.date <= today
                    ? 'text-gray-400 dark:text-gray-600'
                    : 'text-gray-700 dark:text-gray-300'
                }
              >
                <td className="px-3 py-1.5">{s.index}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {formatDay(s.date)}
                  {s.phase === 'deferral' && (
                    <span className="ml-2 text-xs text-violet-600 dark:text-violet-400">différé</span>
                  )}
                </td>
                <td className={cell}>{formatEUR(s.paymentEUR)}</td>
                <td className={cell}>
                  {formatEUR(s.interestEUR)}
                  {s.capitalizedEUR > 0 && ' *'}
                </td>
                <td className={cell}>{formatEUR(s.principalEUR)}</td>
                <td className={cell}>{formatEUR(s.insuranceEUR)}</td>
                <td className={cell}>{formatEUR(s.remainingEUR)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {schedule.some((s) => s.capitalizedEUR > 0) && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          * intérêts non payés, ajoutés au capital pendant le différé total.
        </p>
      )}
    </details>
  )
}

// ---------------------------------------------------------------------------
// Page

export function LoansPage({ loans, saveLoan, removeLoan }: LoansPageProps) {
  const today = localToday()
  const [editingId, setEditingId] = useState<string | null>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const editing = loans.find((l) => l.id === editingId) ?? null

  const totals = useMemo(() => {
    const statuses = loans.map((l) => loanStatus(l, buildLoanSchedule(l), today))
    return {
      remaining: statuses.reduce((s, x) => s + (x.started ? x.remainingEUR : 0), 0),
      monthly: statuses.reduce(
        (s, x) => s + (x.next ? x.next.paymentEUR + x.next.insuranceEUR : 0),
        0
      ),
      cost: statuses.reduce((s, x) => s + x.totalCostEUR, 0),
    }
  }, [loans, today])

  function submit(form: FormState): string | null {
    const loan = fromForm(form, editing?.id ?? crypto.randomUUID())
    if (typeof loan === 'string') return loan
    if (!saveLoan(loan)) return 'Enregistrement impossible : le stockage du navigateur est plein ou bloqué.'
    setEditingId(null)
    return null
  }

  function edit(id: string) {
    setEditingId(id)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-6">
      {loans.length === 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <h3 className="text-lg font-semibold mb-2">Suivre un emprunt</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Renseigne les conditions de ton prêt : l’échéancier, le capital restant dû, ce qui
            est déjà remboursé et le coût total se calculent tout seuls, et se mettent à jour
            chaque mois. Dès qu’un emprunt est enregistré, la page Patrimoine affiche aussi ton
            patrimoine net, dette déduite. Les prêts immobiliers ne sont pas encore gérés.
          </p>
        </div>
      )}

      {loans.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            ['Dette totale', formatEUR(totals.remaining), 'capital restant dû, tous prêts'],
            ['Prochaines échéances', formatEUR(totals.monthly), 'assurance comprise'],
            ['Coût total des crédits', formatEUR(totals.cost), 'intérêts, assurance et frais'],
          ].map(([label, value, sub]) => (
            <div
              key={label}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm"
            >
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{label}</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {loans.map((loan) => (
        <LoanCard
          key={loan.id}
          loan={loan}
          today={today}
          onEdit={() => edit(loan.id)}
          onRemove={() => {
            if (editingId === loan.id) setEditingId(null)
            removeLoan(loan.id)
          }}
        />
      ))}

      <div
        ref={formRef}
        className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm"
      >
        <h3 className="text-lg font-semibold mb-1">
          {editing ? `Modifier « ${editing.name} »` : 'Ajouter un emprunt'}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
          Les montants figurent sur l’offre de prêt ou le tableau d’amortissement de ta banque.
        </p>
        <LoanForm
          key={editing?.id ?? 'new'}
          initial={editing ? toForm(editing) : EMPTY_FORM}
          editing={editing != null}
          onSubmit={submit}
          onCancel={() => setEditingId(null)}
        />
      </div>
    </div>
  )
}
