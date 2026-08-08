/**
 * Builds a clean, printable, RTL invoice HTML document for a Sale.
 * Meant to be opened directly in a browser and printed / saved as PDF
 * (Cmd+P -> Save as PDF) — this is why HTML was chosen over generating a
 * PDF server-side: browsers handle Arabic text shaping and RTL layout far
 * more reliably than hand-rolled PDF libraries.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PAYMENT_METHOD_AR: Record<string, string> = {
  CASH: 'نقدي',
  CARD: 'بطاقة',
  BANK_TRANSFER: 'تحويل بنكي',
  CREDIT: 'آجل',
};

const STATUS_AR: Record<string, string> = {
  CONFIRMED: 'مؤكدة',
  CANCELLED: 'ملغاة',
};

export interface InvoiceHtmlLine {
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  vatAmount: number;
  lineTotal: number;
}

export interface InvoiceHtmlParams {
  invoiceNumber: string;
  issueDate: string; // formatted, e.g. "2026-08-08 14:23"
  status: string;
  paymentMethod: string;
  seller: {
    name: string;
    vatNumber: string;
    address?: string | null;
  };
  buyer: {
    name: string;
    vatNumber?: string | null;
    phone?: string | null;
  };
  lines: InvoiceHtmlLine[];
  subtotal: number;
  discountAmount: number;
  vatAmount: number;
  totalAmount: number;
  qrCodeDataUrl: string;
}

function money(n: number): string {
  return n.toFixed(2);
}

export function buildInvoiceHtml(p: InvoiceHtmlParams): string {
  const rows = p.lines
    .map(
      (line) => `
      <tr>
        <td>${escapeHtml(line.name)}<div class="sku">${escapeHtml(line.sku)}</div></td>
        <td>${line.quantity} ${escapeHtml(line.unit)}</td>
        <td>${money(line.unitPrice)}</td>
        <td>${money(line.discountAmount)}</td>
        <td>${money(line.vatAmount)}</td>
        <td>${money(line.lineTotal)}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>فاتورة ${escapeHtml(p.invoiceNumber)}</title>
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
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid #1a1a1a;
    padding-bottom: 16px;
    margin-bottom: 24px;
  }
  .company h1 { margin: 0 0 4px; font-size: 20px; }
  .company p { margin: 2px 0; color: #555; font-size: 13px; }
  .invoice-meta { text-align: left; }
  .invoice-meta h2 { margin: 0 0 8px; font-size: 18px; }
  .invoice-meta p { margin: 2px 0; font-size: 13px; }
  .parties {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 24px;
  }
  .party {
    flex: 1;
    background: #f7f7f7;
    border-radius: 8px;
    padding: 12px 16px;
  }
  .party h3 { margin: 0 0 8px; font-size: 13px; color: #666; }
  .party p { margin: 2px 0; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th, td { border: 1px solid #ddd; padding: 10px; text-align: center; font-size: 13px; }
  th { background: #1a1a1a; color: #fff; }
  td:first-child { text-align: right; }
  .sku { color: #888; font-size: 11px; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 24px; }
  .totals table { width: 320px; margin: 0; }
  .totals td { border: none; padding: 6px 10px; font-size: 14px; }
  .totals tr.grand td { border-top: 2px solid #1a1a1a; font-weight: bold; font-size: 16px; }
  .qr-section { display: flex; align-items: center; gap: 16px; margin-top: 24px; }
  .qr-section img { width: 130px; height: 130px; }
  .qr-section .note { font-size: 12px; color: #777; max-width: 400px; }
  .footer { margin-top: 32px; text-align: center; font-size: 12px; color: #999; }
  @media print {
    body { margin: 0; }
    @page { margin: 16mm; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="company">
      <h1>${escapeHtml(p.seller.name)}</h1>
      <p>الرقم الضريبي: ${escapeHtml(p.seller.vatNumber)}</p>
      ${p.seller.address ? `<p>${escapeHtml(p.seller.address)}</p>` : ''}
    </div>
    <div class="invoice-meta">
      <h2>فاتورة ضريبية</h2>
      <p>رقم الفاتورة: <strong>${escapeHtml(p.invoiceNumber)}</strong></p>
      <p>التاريخ: ${escapeHtml(p.issueDate)}</p>
      <p>الحالة: ${STATUS_AR[p.status] ?? escapeHtml(p.status)}</p>
      <p>طريقة الدفع: ${PAYMENT_METHOD_AR[p.paymentMethod] ?? escapeHtml(p.paymentMethod)}</p>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>العميل</h3>
      <p>${escapeHtml(p.buyer.name)}</p>
      ${p.buyer.vatNumber ? `<p>الرقم الضريبي: ${escapeHtml(p.buyer.vatNumber)}</p>` : ''}
      ${p.buyer.phone ? `<p>${escapeHtml(p.buyer.phone)}</p>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>الصنف</th>
        <th>الكمية</th>
        <th>سعر الوحدة</th>
        <th>الخصم</th>
        <th>الضريبة</th>
        <th>الإجمالي</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td>المجموع الفرعي</td><td>${money(p.subtotal)} ر.س</td></tr>
      <tr><td>الخصم</td><td>${money(p.discountAmount)} ر.س</td></tr>
      <tr><td>ضريبة القيمة المضافة</td><td>${money(p.vatAmount)} ر.س</td></tr>
      <tr class="grand"><td>الإجمالي المستحق</td><td>${money(p.totalAmount)} ر.س</td></tr>
    </table>
  </div>

  <div class="qr-section">
    <img src="${p.qrCodeDataUrl}" alt="رمز الاستجابة السريعة">
    <p class="note">امسح الرمز للتحقق من بيانات الفاتورة الأساسية وفق متطلبات هيئة الزكاة والضريبة والجمارك.</p>
  </div>

  <div class="footer">تم إصدار هذه الفاتورة إلكترونيًا</div>
</body>
</html>`;
}
