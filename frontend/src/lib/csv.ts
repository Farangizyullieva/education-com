// CSV eksport (brauzerda, ekrandagi ro'yxatdan). Excel uchun UTF-8 BOM va nuqtali vergul ishlatiladi.

/** Excel/Sheets formulasi sifatida bajarilishi mumkin bo'lgan katakni (=, +, -, @) oldiga ' qo'yib zararsizlantiradi */
const safe = (value: unknown): string => {
  const text = value == null ? '' : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[;"\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(safe).join(';')).join('\r\n');
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const blob = new Blob([`\uFEFF${toCsv(headers, rows)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
