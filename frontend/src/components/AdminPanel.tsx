import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminOverview, AdminUserView } from '@/types/api';
import { api, getErrorMessage, isApiError } from '@/lib/api';
import {
  formatDateTime,
  formatNumber,
  formatRelative,
  planLabel,
} from '@/lib/format';
import { hapticError, hapticSelection, hapticSuccess } from '@/lib/haptics';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { Spinner } from './LoadingScreen';

type AdminTab = 'overview' | 'users' | 'payments' | 'grants';
type GrantDuration = 'month' | 'year' | 'forever' | 'custom' | 'trial';

const TABS: ReadonlyArray<{ key: AdminTab; label: string }> = [
  { key: 'overview', label: 'Обзор' },
  { key: 'users', label: 'Пользователи' },
  { key: 'payments', label: 'Платежи' },
  { key: 'grants', label: 'Выдачи' },
];

const DURATIONS: ReadonlyArray<{ key: GrantDuration; label: string; hint: string }> = [
  { key: 'month', label: '1 месяц', hint: '30 дней' },
  { key: 'year', label: '1 год', hint: '365 дней' },
  { key: 'forever', label: 'Навсегда', hint: '100 лет' },
  { key: 'trial', label: 'Триал', hint: '2 дня' },
  { key: 'custom', label: 'Свой срок', hint: 'дни' },
];

function isForever(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return Date.parse(expiresAt) > Date.now() + 50 * 365 * 24 * 60 * 60 * 1000;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }): JSX.Element {
  return (
    <div className="rounded-2xl border border-slate-300/15 bg-tg-secondary-bg/40 px-3 py-2.5">
      <p className="text-lg font-extrabold leading-6 text-tg-text">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-tg-hint">{label}</p>
      {hint ? <p className="mt-0.5 text-[9px] text-tg-hint/80">{hint}</p> : null}
    </div>
  );
}

function UserRowAdmin({
  user,
  selected,
  onSelect,
}: {
  user: AdminUserView;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-colors ${
        selected
          ? 'border-rose-300/40 bg-rose-500/10'
          : 'border-slate-300/15 bg-tg-secondary-bg/30'
      }`}
    >
      <Avatar name={user.firstName} src={user.avatarUrl} size={34} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-xs font-bold text-tg-text">{user.firstName}</p>
          <span className="shrink-0 rounded-full bg-tg-secondary-bg/70 px-1.5 py-0.5 text-[9px] font-bold uppercase text-tg-hint">
            {planLabel(user.plan)}
          </span>
        </div>
        <p className="truncate text-[10px] text-tg-hint">
          {user.username ? `@${user.username} · ` : ''}id {user.id}
          {user.partnerName ? ` · с ${user.partnerName}` : ''}
        </p>
        <p className="text-[9px] text-tg-hint/80">
          Был(а): {formatRelative(user.lastSeenAt)}
          {user.isPro && user.expiresAt
            ? isForever(user.expiresAt)
              ? ' · PRO бессрочно'
              : ` · PRO до ${formatDateTime(user.expiresAt)}`
            : ''}
        </p>
      </div>
    </button>
  );
}

export function AdminPanel({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const { state, refresh } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminUserView | null>(null);
  const [duration, setDuration] = useState<GrantDuration>('month');
  const [customDays, setCustomDays] = useState('30');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (showLoader = true): Promise<void> => {
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const overview = await api.getAdminOverview();
      setData(overview);
    } catch (caught) {
      setError(getErrorMessage(caught));
      if (isApiError(caught) && caught.code === 'NOT_ADMIN') {
        toast.error('Нет доступа к админ-панели');
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!data) return [];
    if (!query) return data.users;
    return data.users.filter((user) =>
      [
        String(user.id),
        user.firstName,
        user.username ?? '',
        user.partnerName ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [data, search]);

  const handleGrant = async (): Promise<void> => {
    if (!selected?.pairId) {
      toast.error('У пользователя ещё нет пары');
      hapticError();
      return;
    }
    const days = duration === 'custom' ? Number.parseInt(customDays, 10) : undefined;
    if (duration === 'custom' && (!Number.isInteger(days) || (days ?? 0) < 1)) {
      toast.error('Укажите количество дней');
      return;
    }
    setBusy(true);
    hapticSelection();
    try {
      await api.grantAdminPro({
        pairId: selected.pairId,
        duration,
        ...(days ? { days } : {}),
        note: note.trim() || null,
      });
      hapticSuccess();
      toast.success(`PRO выдан: ${selected.firstName}`);
      setNote('');
      await load(false);
      await refresh();
    } catch (caught) {
      hapticError();
      toast.error(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (): Promise<void> => {
    if (!selected?.pairId) return;
    if (!window.confirm(`Снять PRO у ${selected.firstName}?`)) return;
    setBusy(true);
    try {
      await api.revokeAdminPro(selected.pairId, note.trim() || null);
      hapticSuccess();
      toast.success('PRO снят');
      await load(false);
      await refresh();
    } catch (caught) {
      hapticError();
      toast.error(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  if (!state?.isAdmin) return <></>;

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet"
      title="Админ-панель"
      description="Аналитика, платежи и ручная выдача PRO"
      contentClassName="pb-6"
    >
      <div className="mb-3 flex gap-1 overflow-x-auto rounded-2xl bg-tg-secondary-bg/60 p-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              hapticSelection();
              setTab(item.key);
            }}
            className={`min-h-[38px] shrink-0 rounded-xl px-3 text-[11px] font-semibold transition-colors ${
              tab === item.key
                ? 'bg-tg-bg text-tg-text shadow-soft'
                : 'text-tg-hint'
            }`}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto flex min-h-[38px] shrink-0 items-center gap-1 rounded-xl px-2.5 text-[11px] font-semibold text-tg-link"
        >
          {loading ? <Spinner size={12} /> : '↻'}
        </button>
      </div>

      {error ? (
        <div className="mb-3 rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <Spinner size={24} />
        </div>
      ) : null}

      {data && tab === 'overview' ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Пользователи" value={String(data.stats.totalUsers)} />
            <StatCard label="Пары" value={String(data.stats.totalPairs)} />
            <StatCard label="Активных PRO" value={String(data.stats.activePro)} />
            <StatCard label="Активных триалов" value={String(data.stats.activeTrial)} />
            <StatCard label="Заходили сегодня" value={String(data.stats.loginsToday)} hint="по Москве" />
            <StatCard label="Платежей" value={String(data.stats.paymentsCount)} />
          </div>
          <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-200">
              Доход в Stars
            </p>
            <p className="mt-0.5 text-2xl font-extrabold text-tg-text">
              {formatNumber(data.stats.starsRevenue)} ⭐
            </p>
            <p className="text-[10px] text-tg-hint">
              Успешных оплат: {data.stats.paymentsCount}
            </p>
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-tg-hint">
              Последние входы
            </p>
            <div className="space-y-1.5">
              {data.users.slice(0, 6).map((user) => (
                <UserRowAdmin
                  key={user.id}
                  user={user}
                  selected={selected?.id === user.id}
                  onSelect={() => {
                    setSelected(user);
                    setTab('users');
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {data && tab === 'users' ? (
        <div className="space-y-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по имени, @username или id"
            className="field"
          />
          <div className="max-h-[42vh] space-y-1.5 overflow-y-auto pr-1">
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
                <UserRowAdmin
                  key={user.id}
                  user={user}
                  selected={selected?.id === user.id}
                  onSelect={() => {
                    hapticSelection();
                    setSelected(user);
                  }}
                />
              ))
            ) : (
              <p className="py-6 text-center text-xs text-tg-hint">Никого не нашли</p>
            )}
          </div>

          {selected ? (
            <div className="rounded-2xl border border-slate-300/20 bg-tg-secondary-bg/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-bold text-tg-text">
                  {selected.firstName}
                </p>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-[10px] font-semibold text-tg-hint"
                >
                  закрыть
                </button>
              </div>
              <p className="mt-0.5 text-[10px] text-tg-hint">
                {selected.pairId ? `Пара ${selected.pairId.slice(0, 8)}…` : 'Без пары'} ·{' '}
                {selected.isPro && selected.expiresAt
                  ? isForever(selected.expiresAt)
                    ? 'PRO бессрочно'
                    : `PRO до ${formatDateTime(selected.expiresAt)}`
                  : 'FREE'}
              </p>

              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {DURATIONS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      hapticSelection();
                      setDuration(item.key);
                    }}
                    className={`min-h-[44px] rounded-xl border px-1.5 text-[10px] font-semibold leading-4 ${
                      duration === item.key
                        ? 'border-tg-button bg-tg-button/10 text-tg-button'
                        : 'border-slate-300/20 bg-tg-bg/30 text-tg-hint'
                    }`}
                  >
                    {item.label}
                    <span className="block text-[8px] font-medium opacity-70">{item.hint}</span>
                  </button>
                ))}
              </div>

              {duration === 'custom' ? (
                <input
                  type="number"
                  min={1}
                  max={36500}
                  value={customDays}
                  onChange={(event) => setCustomDays(event.target.value)}
                  placeholder="Дней"
                  className="field mt-2"
                />
              ) : null}

              <input
                value={note}
                onChange={(event) => setNote(event.target.value.slice(0, 300))}
                placeholder="Комментарий (необязательно)"
                className="field mt-2"
              />

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleGrant()}
                  disabled={busy || !selected.pairId}
                  className="btn btn-primary flex-1"
                >
                  {busy ? <Spinner size={14} /> : 'Выдать PRO'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRevoke()}
                  disabled={busy || !selected.isPro}
                  className="btn btn-danger px-3"
                >
                  Снять
                </button>
              </div>
              {!selected.pairId ? (
                <p className="mt-1.5 text-[10px] text-tg-hint">
                  Сначала пользователь должен создать/принять пару.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-center text-[10px] text-tg-hint">
              Выберите пользователя, чтобы выдать PRO.
            </p>
          )}
        </div>
      ) : null}

      {data && tab === 'payments' ? (
        <div className="space-y-1.5">
          {data.payments.length > 0 ? (
            data.payments.map((payment) => (
              <div
                key={payment.id}
                className="rounded-2xl border border-slate-300/15 bg-tg-secondary-bg/30 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-tg-text">
                    {payment.userName ?? 'Пользователь'} · {payment.plan === 'monthly' ? 'месяц' : 'год'}
                  </p>
                  <span className="shrink-0 text-[11px] font-bold text-tg-text">
                    {payment.amount} {payment.currency}
                  </span>
                </div>
                <p className="mt-0.5 text-[9px] text-tg-hint">
                  {payment.provider} · {payment.status} · {formatDateTime(payment.createdAt)}
                </p>
              </div>
            ))
          ) : (
            <p className="py-6 text-center text-xs text-tg-hint">Платежей пока нет</p>
          )}
        </div>
      ) : null}

      {data && tab === 'grants' ? (
        <div className="space-y-1.5">
          {data.grants.length > 0 ? (
            data.grants.map((grant) => (
              <div
                key={grant.id}
                className="rounded-2xl border border-slate-300/15 bg-tg-secondary-bg/30 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-tg-text">
                    {grant.targetName ?? grant.pairId.slice(0, 8)} · {grant.planType}
                  </p>
                  <span className="text-[9px] text-tg-hint">
                    {grant.durationDays ? `${grant.durationDays} дн.` : 'снято'}
                  </span>
                </div>
                <p className="mt-0.5 text-[9px] text-tg-hint">
                  {grant.adminName ?? 'админ'} · {formatDateTime(grant.createdAt)}
                  {grant.note ? ` · ${grant.note}` : ''}
                </p>
              </div>
            ))
          ) : (
            <p className="py-6 text-center text-xs text-tg-hint">Выдач пока не было</p>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
