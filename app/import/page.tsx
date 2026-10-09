"use client";

import { ArrowLeft, Check, FileUp, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type Row = {
  date?: string | null;
  unit_price?: number | null;
  amount?: number | null;
};

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const selectFile = async (selected: File | null) => {
    setFile(null);
    setCount(0);
    setError("");
    setResult("");
    if (!selected) return;
    if (selected.size > 500_000) {
      setError("Файл завеликий. Виберіть JSON до 500 КБ.");
      return;
    }
    try {
      const payload = JSON.parse(await selected.text()) as Row[];
      if (!Array.isArray(payload) || payload.length > 200) {
        throw new Error("Потрібен JSON-масив із записами.");
      }
      setFile(selected);
      setCount(payload.length);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Не вдалося прочитати JSON.");
    }
  };

  const importRows = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult("");
    try {
      const records = JSON.parse(await file.text());
      const response = await fetch("/api/fuel/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ records }),
      });
      const payload = (await response.json()) as {
        error?: string;
        inserted?: number;
        alreadyImported?: number;
      };
      if (!response.ok) throw new Error(payload.error || "Імпорт не завершився.");
      setResult(
        "Імпортовано " + (payload.inserted ?? 0) + " записів. Уже наявних: " + (payload.alreadyImported ?? 0) + ".",
      );
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Не вдалося імпортувати записи.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="import-shell">
      <Link className="import-back" href="/"><ArrowLeft size={17} />До журналу</Link>
      <section className="import-panel">
        <div className="import-icon"><FileUp size={24} /></div>
        <p className="eyebrow">ОДНОРАЗОВЕ НАЛАШТУВАННЯ</p>
        <h1>Перенести заправки з Notion</h1>
        <p className="import-description">Виберіть експортований JSON. Записи збережуться у базі застосунку, а повторний імпорт не створить копії.</p>
        <label className="upload-zone">
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => void selectFile(event.target.files?.[0] ?? null)}
          />
          <FileUp size={19} />
          <span>{file ? file.name : "Вибрати JSON-файл"}</span>
          {file ? <small>{count} записів</small> : <small>До 500 КБ</small>}
        </label>
        <button className="button-primary import-submit" type="button" onClick={() => void importRows()} disabled={!file || busy}>
          {busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}
          {busy ? "Переношу записи…" : "Імпортувати в журнал"}
        </button>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {result ? <p className="import-result" role="status"><Check size={17} />{result}</p> : null}
        <p className="import-safety"><ShieldCheck size={15} /> Цю сторінку бачить лише власник приватного застосунку.</p>
      </section>
    </main>
  );
}
