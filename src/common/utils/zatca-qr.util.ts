/**
 * ZATCA-compliant QR code payload builder (Phase 1 / Generation phase).
 *
 * Encodes fields as TLV (Tag-Length-Value): each field is
 * [1 byte tag][1 byte length][UTF-8 value bytes], concatenated and
 * Base64-encoded. This is the payload that gets rendered as a QR code image
 * and embedded in the invoice XML.
 *
 * Phase 1 requires 5 tags (seller name, VAT number, timestamp, invoice
 * total, VAT total). Phase 2 adds 4 more tags (invoice hash, digital
 * signature, public key, certificate signature) once the invoice is
 * cryptographically signed with a real ZATCA-issued CSID — not implemented
 * here since it requires production credentials from ZATCA onboarding.
 */

export interface ZatcaQrField {
  tag: number;
  value: string;
}

export function buildZatcaQrBase64(fields: ZatcaQrField[]): string {
  const buffers = fields.map(({ tag, value }) => {
    const valueBuffer = Buffer.from(value, 'utf-8');
    const tlv = Buffer.alloc(2 + valueBuffer.length);
    tlv.writeUInt8(tag, 0);
    tlv.writeUInt8(valueBuffer.length, 1);
    valueBuffer.copy(tlv, 2);
    return tlv;
  });
  return Buffer.concat(buffers).toString('base64');
}

/** Builds the 5 mandatory Phase 1 fields for a simplified/standard invoice QR. */
export function buildPhase1QrFields(params: {
  sellerName: string;
  vatNumber: string;
  timestamp: Date;
  invoiceTotal: number;
  vatTotal: number;
}): ZatcaQrField[] {
  return [
    { tag: 1, value: params.sellerName },
    { tag: 2, value: params.vatNumber },
    { tag: 3, value: params.timestamp.toISOString() },
    { tag: 4, value: params.invoiceTotal.toFixed(2) },
    { tag: 5, value: params.vatTotal.toFixed(2) },
  ];
}
