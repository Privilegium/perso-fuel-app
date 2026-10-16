"use client";

import { Check, ChevronLeft, ChevronRight, CircleAlert, LoaderCircle, MapPin, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { priceMoney, number, dateKey, dateForDisplay, asNumber } from "@/lib/fuel-format";
import type { FuelEntry, FormMode, JournalChange } from "@/lib/fuel-types";

export default function FuelDialog({
  mode,
  entry,
  lastPrice,
  onClose,
  onSaved,
}: {
  mode: FormMode;
  entry: FuelEntry | null;
  lastPrice: number | null;
  onClose: () => void;
  onSaved: (message: string, change: JournalChange) => void;
}) {
  const [step, setStep] = useState(1);
  const [unitPrice, setUnitPrice] = useState(entry?.unitPrice?.toString() ?? lastPrice?.toString() ?? "");
  const [amount, setAmount] = useState(entry?.amount?.toString() ?? "");
  const [odometer, setOdometer] = useState(entry?.odometer?.toString() ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [fillDate, setFillDate] = useState(entry?.fillDate ?? dateKey());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(
    entry?.latitude != null && entry.longitude != null
      ? { latitude: entry.latitude, longitude: entry.longitude, accuracy: entry.locationAccuracy ?? 0 }
      : null,
  );
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
      if (event.key === "ArrowLeft" && step > 1) setStep((current) => current - 1);
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("dialog-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("dialog-open");
    };
  }, [onClose, saving, step]);

  const price = asNumber(unitPrice);
  const paid = asNumber(amount);
  const estimatedLiters = price && paid ? paid / price : null;

  const captureLocation = () => {
    setError("");
    if (!navigator.geolocation) {
      setError("Цей браузер не підтримує геолокацію.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setLocating(false);
      },
      (geoError) => {
        setLocating(false);
        setError(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Доступ до геолокації не надано. Запис можна зберегти без місця."
            : "Не вдалося визначити місце. Спробуйте ще раз або збережіть без нього.",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  const save = async (skipMileage = false) => {
    setError("");
    if (!navigator.onLine) {
      setError("Для збереження потрібен інтернет. Введені дані залишаються у формі.");
      return;
    }
    setSaving(true);
    try {
      const body =
        mode === "new"
          ? {
              fillDate: dateKey(),
              unitPrice: price,
              amount: paid,
              odometer: skipMileage ? null : asNumber(odometer),
              note,
              latitude: location?.latitude ?? null,
              longitude: location?.longitude ?? null,
              locationAccuracy: location?.accuracy ?? null,
            }
          : {
              fillDate: fillDate || undefined,
              unitPrice: unitPrice.trim() ? price : undefined,
              amount: amount.trim() ? paid : undefined,
              odometer: odometer.trim() ? asNumber(odometer) : null,
              note,
            };
      const response = await fetch(
        mode === "new" ? "/api/fuel" : "/api/fuel/" + encodeURIComponent(entry!.id),
        {
          method: mode === "new" ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = (await response.json()) as { error?: string; entry?: FuelEntry };
      if (!response.ok || !result.entry) throw new Error(result.error || "Не вдалося зберегти запис.");
      onSaved(mode === "new" ? "Заправку збережено" : "Зміни збережено", { entry: result.entry });
    } catch (saveError) {
      setError(saveError instanceof TypeError
        ? "Для збереження потрібен інтернет. Не вдалося під’єднатися; введені дані залишаються у формі."
        : saveError instanceof Error ? saveError.message : "Не вдалося зберегти запис.");
      setSaving(false);
    }
  };

  const removeEntry = async () => {
    if (mode !== "edit" || !entry) return;
    setError("");
    if (!navigator.onLine) {
      setError("Для видалення потрібен інтернет. Запис не видалено.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/fuel/" + encodeURIComponent(entry.id), { method: "DELETE" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Не вдалося видалити запис.");
      onSaved("Запис видалено", { deletedId: entry.id });
    } catch (deleteError) {
      setError(deleteError instanceof TypeError
        ? "Не вдалося під’єднатися. Запис не видалено; спробуйте після підключення."
        : deleteError instanceof Error ? deleteError.message : "Не вдалося видалити запис.");
      setSaving(false);
    }
  };

  const next = () => {
    setError("");
    if (step === 1) {
      if (!note.trim()) {
        setError("Додайте короткий опис або виберіть один із варіантів.");
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!price || price <= 0) {
        setError("Введіть ціну одного літра.");
        return;
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      if (!paid || paid <= 0) {
        setError("Введіть суму, яку ви сплатили.");
        return;
      }
      setStep(4);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <section className="fuel-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog-grabber" />
        <header className="dialog-header">
          <div>
            <p className="eyebrow">{mode === "new" ? "НОВИЙ ЗАПИС" : "ЖУРНАЛ ЗАПРАВОК"}</p>
            <h2 id="dialog-title">{mode === "new" ? "Записати заправку" : "Редагувати запис"}</h2>
          </div>
          <button className="icon-button dialog-close" type="button" aria-label="Закрити" onClick={onClose} disabled={saving}>
            <X size={19} />
          </button>
        </header>

        {mode === "new" ? (
          <>
            <div className="step-progress" aria-label={"Крок " + step + " з 4"}>
              {[1, 2, 3, 4].map((item) => <span key={item} className={item <= step ? "step-active" : ""} />)}
            </div>
            <p className="step-caption">
              КРОК {step} З 4 <span>{step === 1 ? "Опис" : step === 2 ? "Ціна за літр" : step === 3 ? "Оплата" : "Пробіг і місце"}</span>
              {step > 1 ? <button type="button" onClick={() => setStep((current) => current - 1)}><ChevronLeft size={13} />Назад</button> : null}
            </p>
            {step === 1 && (
              <div className="description-step">
                <label className="field-label" htmlFor="fill-description">
                  Що це була за заправка?
                  <textarea
                    ref={noteInput}
                    id="fill-description"
                    className="note-input description-input"
                    placeholder="Наприклад: планова, поїздка до Ансі"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={120}
                  />
                  <small>Короткий опис залишиться в історії поруч із датою.</small>
                </label>
                <div className="quick-description" role="group" aria-label="Швидкий опис">
                  <span>Швидкий вибір</span>
                  {[
                    { label: "Планова", value: "Планова" },
                    { label: "Поїздка до", value: "Поїздка до " },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={note.trim() === item.value.trim() ? "quick-description-option selected" : "quick-description-option"}
                      onClick={() => {
                        setNote(item.value);
                        requestAnimationFrame(() => {
                          noteInput.current?.focus();
                          noteInput.current?.setSelectionRange(item.value.length, item.value.length);
                        });
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {step === 2 && (
              <label className="field-label" htmlFor="unit-price">
                Ціна одного літра
                <span className="input-shell">
                  <span className="input-prefix">€</span>
                  <input
                    id="unit-price"
                    autoFocus
                    type="number"
                    inputMode="decimal"
                    min="0.001"
                    step="0.001"
                    placeholder="1,85"
                    value={unitPrice}
                    onChange={(event) => setUnitPrice(event.target.value)}
                  />
                  <span className="input-suffix">/ л</span>
                </span>
                {lastPrice != null ? <small>Остання записана ціна — {priceMoney.format(lastPrice)} за літр</small> : null}
              </label>
            )}
            {step === 3 && (
              <label className="field-label" htmlFor="amount">
                Скільки ви сплатили
                <span className="input-shell">
                  <span className="input-prefix">€</span>
                  <input
                    id="amount"
                    autoFocus
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    placeholder="50,00"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </span>
                {estimatedLiters != null ? <small>Приблизно {number.format(estimatedLiters)} л</small> : null}
              </label>
            )}
            {step === 4 && (
              <div className="final-step-fields">
                <div className="automatic-date">
                  <CalendarIcon />
                  <span>Дата запису</span>
                  <strong>{dateForDisplay(dateKey())}</strong>
                  <small>Визначається автоматично</small>
                </div>
                <label className="field-label" htmlFor="odometer">
                  Пробіг автомобіля <span className="optional-word">необов’язково</span>
                  <span className="input-shell">
                    <input
                      id="odometer"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      placeholder="151 200"
                      value={odometer}
                      onChange={(event) => setOdometer(event.target.value)}
                    />
                    <span className="input-suffix">км</span>
                  </span>
                  <small>Можна додати пізніше з журналу.</small>
                </label>
                <button className={"location-choice " + (location ? "location-ready" : "")} type="button" onClick={captureLocation} disabled={locating}>
                  {locating ? <LoaderCircle className="spin" size={19} /> : location ? <Check size={19} /> : <MapPin size={19} />}
                  <span>
                    <strong>{locating ? "Визначаємо місце…" : location ? "Місце додано" : "Додати місце заправки"}</strong>
                    <small>{location ? "Координати буде збережено з записом" : "Необов’язково · запит з’явиться лише після натискання"}</small>
                  </span>
                  {!location && !locating ? <ChevronRight size={17} /> : null}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="edit-fields">
            <label className="field-label" htmlFor="edit-date">
              Дата
              <input id="edit-date" className="plain-input" type="date" value={fillDate} onChange={(event) => setFillDate(event.target.value)} />
            </label>
            <label className="field-label" htmlFor="edit-price">
              Ціна одного літра
              <span className="input-shell"><span className="input-prefix">€</span><input id="edit-price" type="number" inputMode="decimal" min="0.001" step="0.001" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} /></span>
            </label>
            <label className="field-label" htmlFor="edit-amount">
              Сплачено
              <span className="input-shell"><span className="input-prefix">€</span><input id="edit-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></span>
            </label>
            <label className="field-label" htmlFor="edit-odometer">
              Пробіг <span className="optional-word">необов’язково</span>
              <span className="input-shell"><input id="edit-odometer" type="number" inputMode="numeric" min="0" step="1" value={odometer} onChange={(event) => setOdometer(event.target.value)} /><span className="input-suffix">км</span></span>
            </label>
            <label className="field-label" htmlFor="edit-note">
              Опис заправки
              <textarea id="edit-note" className="note-input" placeholder="Додати нотатку" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
            </label>
            <button className="delete-entry-trigger" type="button" onClick={() => setConfirmDelete(true)} disabled={saving}>
              <Trash2 size={16} />Видалити цей запис
            </button>
          </div>
        )}

        {mode === "edit" && confirmDelete ? (
          <div className="delete-confirm" role="alert">
            <strong>Видалити запис остаточно?</strong>
            <p>Запис буде видалено з бази сайту. Цю дію не можна скасувати.</p>
            <div>
              <button className="button-secondary" type="button" onClick={() => setConfirmDelete(false)} disabled={saving}>Залишити</button>
              <button className="button-danger" type="button" onClick={() => void removeEntry()} disabled={saving}>
                {saving ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={16} />}Видалити остаточно
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="form-error" role="alert"><CircleAlert size={16} />{error}</p> : null}

        <footer className="dialog-actions">
          {mode === "edit" ? (
            <>
              <button className="button-secondary" type="button" onClick={onClose} disabled={saving}>Скасувати</button>
              <button className="button-primary" type="button" onClick={() => void save()} disabled={saving}>
                {saving ? <LoaderCircle className="spin" size={18} /> : null}Зберегти зміни
              </button>
            </>
          ) : step < 4 ? (
            <>
              <span />
              <button className="button-primary" type="button" onClick={next}>Далі<ChevronRight size={17} /></button>
            </>
          ) : (
            <>
              {odometer.trim() ? (
                <button className="button-secondary skip-button" type="button" onClick={() => void save(true)} disabled={saving}>
                  {saving ? <LoaderCircle className="spin" size={18} /> : null}Без пробігу
                </button>
              ) : null}
              <button className="button-primary" type="button" onClick={() => void save()} disabled={saving}>
                {saving ? <LoaderCircle className="spin" size={18} /> : null}
                {odometer.trim() ? "Зберегти запис" : "Зберегти без пробігу"}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}

function CalendarIcon() {
  return <span className="calendar-glyph" aria-hidden="true">Д</span>;
}

