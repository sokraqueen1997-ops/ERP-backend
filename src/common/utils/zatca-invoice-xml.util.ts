/**
 * Builds an UNSIGNED UBL 2.1-shaped invoice XML for ZATCA e-invoicing.
 *
 * IMPORTANT: this covers the invoice STRUCTURE only. Full Phase 2 compliance
 * additionally requires:
 *   - A ds:UBLExtensions / ds:Signature block, cryptographically signed with
 *     a production CSID issued by ZATCA after onboarding.
 *   - A PIH (Previous Invoice Hash) chaining each invoice to the one before it.
 *   - Submission to ZATCA's Clearance (B2B) or Reporting (B2C) API and
 *     embedding the response back into the final document.
 * None of that is implemented here since it requires real ZATCA production
 * credentials. This XML is the correct starting structure to sign once those
 * credentials exist — verify field names against the latest official ZATCA
 * technical guideline before going live.
 */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface ZatcaInvoiceLine {
  name: string;
  quantity: number;
  unitPrice: number;
  lineExtensionAmount: number;
  vatAmount: number;
  vatRate: number;
}

export interface ZatcaInvoiceXmlParams {
  invoiceNumber: string;
  uuid: string;
  issueDate: string; // YYYY-MM-DD
  issueTime: string; // HH:mm:ss
  isStandard: boolean; // true = B2B (Standard), false = B2C (Simplified)
  currency: string;
  seller: {
    name: string;
    vatNumber: string;
    buildingNumber?: string | null;
    street?: string | null;
    city?: string | null;
    postalCode?: string | null;
  };
  buyer?: {
    name: string;
    vatNumber?: string | null;
  };
  lines: ZatcaInvoiceLine[];
  lineExtensionTotal: number;
  taxExclusiveAmount: number;
  taxInclusiveAmount: number;
  vatTotal: number;
  qrBase64: string;
}

export function buildZatcaInvoiceXml(p: ZatcaInvoiceXmlParams): string {
  // ZATCA subtype code: 0100000 = Standard (B2B), 0200000 = Simplified (B2C).
  // Verify against the current official technical guideline before production use.
  const invoiceTypeName = p.isStandard ? '0100000' : '0200000';

  const linesXml = p.lines
    .map(
      (line, idx) => `
  <cac:InvoiceLine>
    <cbc:ID>${idx + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="PCE">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${p.currency}">${line.lineExtensionAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${p.currency}">${line.vatAmount.toFixed(2)}</cbc:TaxAmount>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${escapeXml(line.name)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:Percent>${line.vatRate.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${p.currency}">${line.unitPrice.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`,
    )
    .join('');

  const buyerXml = p.buyer
    ? `
  <cac:AccountingCustomerParty>
    <cac:Party>${
      p.buyer.vatNumber
        ? `
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(p.buyer.vatNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>`
        : ''
    }
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(p.buyer.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <!-- UNSIGNED structure — see file header. Not yet submitted to ZATCA. -->
  <cbc:ID>${escapeXml(p.invoiceNumber)}</cbc:ID>
  <cbc:UUID>${p.uuid}</cbc:UUID>
  <cbc:IssueDate>${p.issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${p.issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${invoiceTypeName}">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${p.currency}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>${p.currency}</cbc:TaxCurrencyCode>

  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PostalAddress>${p.seller.buildingNumber ? `
        <cbc:BuildingNumber>${escapeXml(p.seller.buildingNumber)}</cbc:BuildingNumber>` : ''}${p.seller.street ? `
        <cbc:StreetName>${escapeXml(p.seller.street)}</cbc:StreetName>` : ''}${p.seller.city ? `
        <cbc:CityName>${escapeXml(p.seller.city)}</cbc:CityName>` : ''}${p.seller.postalCode ? `
        <cbc:PostalZone>${escapeXml(p.seller.postalCode)}</cbc:PostalZone>` : ''}
        <cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(p.seller.vatNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(p.seller.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
${buyerXml}
  <cac:AdditionalDocumentReference>
    <cbc:ID>QR</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${p.qrBase64}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${p.currency}">${p.vatTotal.toFixed(2)}</cbc:TaxAmount>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${p.currency}">${p.lineExtensionTotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${p.currency}">${p.taxExclusiveAmount.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${p.currency}">${p.taxInclusiveAmount.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${p.currency}">${p.taxInclusiveAmount.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${linesXml}
</Invoice>`;
}
