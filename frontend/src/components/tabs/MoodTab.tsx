import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { MoodStatus } from '@/types/api';
import { api, getErrorMessage } from '@/lib/api';
import {
  MOOD_PRESETS,
  formatRelative,
  getMoodDisplay,
  getMoodPreset,
} from '@/lib/format';
import {
  hapticError,
  hapticSelection,
  hapticSuccess,
} from '@/lib/haptics';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { Avatar } from '@/components/Avatar';
import { Spinner } from '@/components/LoadingScreen';

/** Вкладка настроения: пресеты, кастомный статус и настроение партнёра. */
export function MoodTab(): JSX.Element {
  const { state, applyState } = useApp();
  const toast = useToast();
  const reduceMotion = useReducedMotion();

  const savedMood = state?.user.moodStatus ?? 'chill';
  const savedText = state?.user.moodText ?? '';

  const [selected, setSelected] = useState<MoodStatus>(savedMood);
  const [text, setText] = useState(savedText);
  const [saving, setSaving] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!busyRef.current) setSelected(savedMood);
  }, [savedMood]);

  const persist = async (
    status: MoodStatus,
    moodText: string | null,
    successMessage?: string,
  ): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setSaving(true);
    try {
      const response = await api.setMood(status, moodText);
      applyState(response.state);
      if (successMessage) toast.success(successMessage);
      return true;
    } catch (caught) {
      hapticError();
      toast.error(getErrorMessage(caught));
      return false;
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  const handlePreset = async (status: MoodStatus): Promise<void> => {
    if (busyRef.current) return;
    hapticSelection();
    setSelected(status);
    const keepText = state?.user.moodText ?? null;
    const ok = await persist(status, keepText);
    if (!ok) setSelected(savedMood);
  };

  const handleSaveCustom = async (): Promise<void> => {
    if (busyRef.current) return;
    const trimmed = text.trim();
    if (trimmed.length > 40) {
      toast.error('Максимум 40 символов');
      return;
    }
    const ok = await persist(
      selected,
      trimmed.length > 0 ? trimmed : null,
      'Настроение обновлено',
    );
    if (ok) {
      setText(trimmed);
      hapticSuccess();
    }
  };

  const handleClear = async (): Promise<void> => {
    if (busyRef.current) return;
    if (text.length === 0 && savedText.length === 0) return;
    hapticSelection();
    setText('');
    await persist(selected, null, 'Статус очищен');
  };

  const partner = state?.partner ?? null;
  const partnerPreset = partner ? getMoodPreset(partner.moodStatus) : null;
  const partnerDisplay = partner
    ? getMoodDisplay(partner.moodStatus, partner.moodText)
    : null;
  const selectedPreset = getMoodPreset(selected);
  const textLeft = 40 - text.length;

  return (
    <div className="mx-auto w-full max-w-[520px] space-y-4 px-4 pt-3">
      <section>
        <div className="flex items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold leading-6 text-tg-text">
              Ваше настроение
            </h2>
            <p className="mt-0.5 text-[11px] leading-4 text-tg-hint">
              Партнёр увидит изменение сразу
            </p>
          </div>
          {saving ? (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-tg-hint">
              <Spinner size={12} />
              Сохраняем…
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {MOOD_PRESETS.map((preset) => {
            const isSelected = preset.key === selected;
            return (
              <motion.button
                key={preset.key}
                type="button"
                whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                onClick={() => {
                  void handlePreset(preset.key);
                }}
                disabled={saving}
                aria-pressed={isSelected}
                className={`relative flex min-h-[64px] flex-col items-start justify-center gap-1 rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${
                  isSelected
                    ? 'border-rose-400/60 bg-gradient-to-br from-rose-500/15 to-orange-400/10 shadow-soft'
                    : 'border-slate-300/20 bg-tg-secondary-bg/40'
                }`}
              >
                <span aria-hidden="true" className="text-xl leading-6">
                  {preset.emoji}
                </span>
                <span
                  className={`line-clamp-2 text-[11.5px] font-semibold leading-4 ${
                    isSelected ? 'text-tg-text' : 'text-tg-text/85'
                  }`}
                >
                  {preset.label}
                </span>
                {isSelected ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white"
                  >
                    ✓
                  </span>
                ) : null}
              </motion.button>
            );
          })}
        </div>
      </section>

      <section className="surface-solid rounded-[24px] p-4">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="mood-custom"
            className="text-[11px] font-semibold uppercase tracking-[0.15em] text-tg-hint"
          >
            Своими словами
          </label>
          <span
            className={`text-[11px] font-medium ${
              textLeft < 8 ? 'text-rose-500' : 'text-tg-hint'
            }`}
          >
            {text.length}/40
          </span>
        </div>

        <textarea
          id="mood-custom"
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, 40))}
          maxLength={40}
          rows={2}
          placeholder={`Например: «${selectedPreset.emoji} ${selectedPreset.short}»`}
          disabled={saving}
          className="field mt-2"
        />

        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={() => {
              void handleSaveCustom();
            }}
            disabled={saving}
            className="btn btn-primary flex-1"
          >
            {saving ? <Spinner size={16} /> : null}
            Сохранить
          </button>
          <button
            type="button"
            onClick={() => {
              void handleClear();
            }}
            disabled={saving || (text.length === 0 && savedText.length === 0)}
            className="btn btn-secondary px-4"
          >
            Очистить
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-300/15 brand-gradient-soft">
        <div className="p-4">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/30 text-base backdrop-blur-sm dark:bg-white/10"
            >
              💭
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-tg-hint">
                Настроение партнёра
              </p>
              {partner ? (
                <p className="text-[11px] leading-4 text-tg-hint">
                  обновлено {formatRelative(partner.moodUpdatedAt)}
                </p>
              ) : null}
            </div>
          </div>

          {partner && partnerDisplay && partnerPreset ? (
            <div className="mt-3 flex items-center gap-3">
              <Avatar
                name={partner.firstName}
                src={partner.avatarUrl}
                size={44}
                ring
              />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-bold text-tg-text">
                  <span aria-hidden="true" className="text-lg">
                    {partnerDisplay.emoji}
                  </span>
                  <span className="truncate">{partner.firstName}</span>
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-tg-text/80">
                  {partner.moodText?.trim()
                    ? partner.moodText
                    : partnerPreset.label}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-300/30 bg-tg-bg/30 px-4 py-5 text-center">
              <p className="text-sm font-semibold text-tg-text">
                Партнёр пока не присоединился
              </p>
              <p className="mt-1 text-xs leading-5 text-tg-hint">
                Отправьте приглашение — и вы сможете делиться настроением в
                реальном времени.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
