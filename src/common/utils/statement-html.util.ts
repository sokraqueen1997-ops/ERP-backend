/**
 * Builds a clean, printable, RTL statement-of-account HTML document for a
 * customer or supplier. Meant to be opened directly in a browser and
 * printed / saved as PDF (Cmd+P -> Save as PDF).
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface StatementHtmlLine {
  date: string; // formatted "YYYY-MM-DD"
  typeLabel: string;
  amount: number;
  balanceAfter: number;
  notes?: string | null;
}

export interface StatementHtmlParams {
  title: string; // e.g. "كشف حساب عميل" or "كشف حساب مورد"
  partyLabel: string; // "العميل" or "المورد"
  partyName: string;
  partyPhone?: string | null;
  periodLabel: string; // e.g. "الفترة: من 2026-01-01 إلى 2026-08-21" or "كل الفترة"
  lines: StatementHtmlLine[];
  closingBalance: number;
  balanceLabel: string; // "الرصيد الحالي (مستحق منه)" / "الرصيد الحالي (مستحق له)"
}

function money(n: number): string {
  return n.toFixed(2);
}

export function buildStatementHtml(p: StatementHtmlParams): string {
  const rows = p.lines
    .map(
      (line) => `
      <tr>
        <td>${escapeHtml(line.date)}</td>
        <td>${escapeHtml(line.typeLabel)}</td>
        <td class="${line.amount >= 0 ? 'debit' : 'credit'}">${money(line.amount)}</td>
        <td>${money(line.balanceAfter)}</td>
        <td class="notes">${line.notes ? escapeHtml(line.notes) : '—'}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(p.title)} - ${escapeHtml(p.partyName)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Tahoma, Arial, sans-serif;
    color: #1a1a1a;
    max-width: 800px;
    margin: 24px auto;
    padding: 0 16px;
    line-height: 1.6;
  }
  .header {
    border-bottom: 3px solid #1a1a1a;
    padding-bottom: 16px;
    margin-bottom: 24px;
  }
  .header h1 { margin: 0 0 6px; font-size: 20px; }
  .header p { margin: 2px 0; color: #555; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th, td { border: 1px solid #ddd; padding: 10px; text-align: center; font-size: 13px; }
  th { background: #1a1a1a; color: #fff; }
  td.notes { text-align: right; color: #888; font-size: 12px; }
  .debit { color: #b91c1c; }
  .credit { color: #15803d; }
  .totals { display: flex; justify-content: flex-end; }
  .totals table { width: 320px; margin: 0; }
  .totals td { border: none; padding: 6px 10px; font-size: 14px; }
  .totals tr.grand td { border-top: 2px solid #1a1a1a; font-weight: bold; font-size: 16px; }
  .footer { margin-top: 32px; text-align: center; font-size: 12px; color: #999; }
  @media print {
    body { margin: 0; }
    @page { margin: 16mm; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(p.title)}</h1>
    <p>${escapeHtml(p.partyLabel)}: ${escapeHtml(p.partyName)}</p>
    ${p.partyPhone ? `<p>${escapeHtml(p.partyPhone)}</p>` : ''}
    <p>${escapeHtml(p.periodLabel)}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>التاريخ</th>
        <th>نوع الحركة</th>
        <th>المبلغ</th>
        <th>الرصيد بعدها</th>
        <th>ملاحظات</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="5">لا توجد حركات بهذي الفترة</td></tr>'}</tbody>
  </table>

  <div class="totals">
    <table>
      <tr class="grand"><td>${escapeHtml(p.balanceLabel)}</td><td>${money(p.closingBalance)} ر.س</td></tr>
    </table>
  </div>

  <div class="footer">تم إصدار هذا الكشف إلكترونيًا</div>
</body>
</html>`;
}
