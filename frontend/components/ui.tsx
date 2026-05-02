import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  Triangle,
  XCircle
} from "lucide-react";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { formatMoney, formatShortDateTime, middleEllipsis } from "../lib/api";
import { createTranslator, type Lang } from "../lib/i18n";
import type { TicketReceipt, TicketStatus, UiState } from "../lib/types";

type ButtonProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  reason?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  children,
  variant = "secondary",
  size = "md",
  disabled = false,
  reason,
  type = "button",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`txButton txButton-${variant} txButton-${size} ${className}`.trim()}
      disabled={disabled}
      title={disabled ? reason : undefined}
      type={type}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "mock";
}) {
  return <span className={`txBadge txBadge-${tone}`}>{children}</span>;
}

export function Card({
  children,
  title,
  action,
  className = ""
}: {
  children: ReactNode;
  title?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`txCard ${className}`}>
      {(title || action) && (
        <header className="txCardHeader">
          {title ? <h2>{title}</h2> : <span />}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export type TableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
};

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyLabel,
  emptyActionLabel
}: {
  columns: TableColumn<T>[];
  rows: T[];
  emptyLabel: string;
  emptyActionLabel?: string;
}) {
  if (rows.length === 0) {
    return <StateBlock state="empty" title={emptyLabel} actionLabel={emptyActionLabel} />;
  }

  return (
    <div className="txTableWrap">
      <table className="txTable">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key} data-label={column.header}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ToastViewport({
  message,
  tone = "success"
}: {
  message?: string;
  tone?: "success" | "error" | "warning";
}) {
  if (!message) return null;

  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? AlertTriangle : XCircle;

  return (
    <div className={`txToast txToast-${tone}`} role="status" aria-live="polite">
      <Icon size={16} />
      <span>{message}</span>
    </div>
  );
}

export function StatusChip({ status, lang = "en" }: { status: TicketStatus | "preview" | "ready" | "reconnecting"; lang?: Lang }) {
  const t = createTranslator(lang);
  const tone =
    status === "listed" || status === "owned" || status === "ready"
      ? "success"
      : status === "halted" || status === "defaulting" || status === "reconnecting"
        ? "warning"
        : status === "cancelled"
          ? "danger"
          : "neutral";

  return <Badge tone={tone}>{t(`status.${status}`)}</Badge>;
}

export function CapacityMeter({
  sold,
  capacity,
  lang = "en"
}: {
  sold: number;
  capacity: number;
  lang?: Lang;
}) {
  const t = createTranslator(lang);
  const percent = capacity <= 0 ? 0 : Math.min(100, Math.round((sold / capacity) * 100));
  const remaining = Math.max(0, capacity - sold);

  return (
    <div className="capacityMeter" aria-label={t("ui.capacityRemaining", { remaining, capacity })}>
      <div className="capacityMeta">
        <span>{t("ui.left", { count: remaining })}</span>
        <span>
          {sold}/{capacity}
        </span>
      </div>
      <div className="capacityTrack">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function HaltCountdownRing({
  label,
  percent,
  lang = "en"
}: {
  label: string;
  percent: number;
  lang?: Lang;
}) {
  const t = createTranslator(lang);
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div
      className="haltRing"
      style={{ "--halt-percent": `${clamped}%` } as CSSProperties}
      aria-label={t("ui.haltCountdown", { label })}
    >
      <span>{label}</span>
    </div>
  );
}

export function ReceiptShell({
  receipt,
  ticker,
  seatLabel,
  lang = "en"
}: {
  receipt: TicketReceipt;
  ticker: string;
  seatLabel: string;
  lang?: Lang;
}) {
  const t = createTranslator(lang);
  return (
    <article className="receiptShell">
      <div className="receiptMark">
        <Triangle size={20} />
        <span>{middleEllipsis(receipt.receiptCode, 5, 4)}</span>
      </div>
      <div className="receiptRoute">
        <strong>{ticker}</strong>
        <span>{seatLabel}</span>
      </div>
      <dl className="receiptGrid">
        <div>
          <dt>{t("ui.session")}</dt>
          <dd>{middleEllipsis(receipt.sessionId, 8, 6)}</dd>
        </div>
        <div>
          <dt>{t("persona.price")}</dt>
          <dd>{formatMoney(receipt.priceCents, lang)}</dd>
        </div>
        <div>
          <dt>{t("ui.fees")}</dt>
          <dd>
            {formatMoney(receipt.sellerFeeCents, lang)} / {formatMoney(receipt.platformFeeCents, lang)}
          </dd>
        </div>
        <div>
          <dt>{t("ui.issued")}</dt>
          <dd>{formatShortDateTime(receipt.issuedAt, lang)}</dd>
        </div>
      </dl>
    </article>
  );
}

export function StateBlock({
  state,
  title,
  detail,
  actionLabel
}: {
  state: UiState;
  title: string;
  detail?: string;
  actionLabel?: string;
}) {
  const Icon = state === "loading" ? Loader2 : state === "error" ? XCircle : Triangle;

  return (
    <div className={`stateBlock stateBlock-${state}`}>
      <Icon size={20} className={state === "loading" ? "spin" : undefined} />
      <div>
        <strong>{title}</strong>
        {detail ? <span>{detail}</span> : null}
      </div>
      {actionLabel ? <Button size="sm">{actionLabel}</Button> : null}
    </div>
  );
}

export function RuleBadges({ lang = "en" }: { lang?: Lang }) {
  const t = createTranslator(lang);
  return (
    <div className="ruleBadges" aria-label={t("ui.marketRules")}>
      <Badge>{t("calendar.bookable30")}</Badge>
      <Badge>{t("calendar.tradable7")}</Badge>
      <Badge>{t("calendar.halt12")}</Badge>
      <Badge>T+0</Badge>
    </div>
  );
}

export function TokenBudgetMeter({
  used,
  budget,
  lang = "en"
}: {
  used: number;
  budget: number;
  lang?: Lang;
}) {
  const t = createTranslator(lang);
  const percent = budget <= 0 ? 0 : Math.min(100, Math.round((used / budget) * 100));

  return (
    <div className="tokenMeter">
      <div className="capacityMeta">
        <span>{t("ui.tokenBudget")}</span>
        <span>
          {used.toLocaleString()} / {budget.toLocaleString()}
        </span>
      </div>
      <div className="capacityTrack">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function LoadingRows() {
  return (
    <div className="skeletonList" aria-label="Loading">
      <span />
      <span />
      <span />
    </div>
  );
}

export function InlineNotice({
  tone = "neutral",
  children
}: {
  tone?: "neutral" | "warning" | "error" | "success";
  children: ReactNode;
}) {
  return (
    <div className={`inlineNotice inlineNotice-${tone}`}>
      <Clock3 size={15} />
      <span>{children}</span>
    </div>
  );
}
