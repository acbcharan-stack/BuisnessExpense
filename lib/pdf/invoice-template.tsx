import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import { INVOICE_DIRECTION_LABELS } from "@/lib/types";
import type { InvoiceRenderData, PartyRenderData } from "./invoice-render-data";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#1a1a1a" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  letterhead: { flex: 1, paddingRight: 16 },
  logo: { width: 90, height: 45, objectFit: "contain", marginBottom: 4 },
  titleBlock: { alignItems: "flex-end" },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  invoiceNo: { fontSize: 10, color: "#444" },
  partiesRow: { flexDirection: "row", gap: 16, marginBottom: 12 },
  partyCard: {
    flex: 1,
    border: "1px solid #ddd",
    borderRadius: 4,
    padding: 8,
  },
  partyLabel: {
    fontSize: 7,
    textTransform: "uppercase",
    color: "#888",
    marginBottom: 3,
  },
  partyName: { fontSize: 10, fontWeight: 700, marginBottom: 2 },
  partyLine: { fontSize: 8, color: "#333", marginBottom: 1 },
  table: { marginTop: 4, borderTop: "1px solid #333" },
  tRow: {
    flexDirection: "row",
    borderBottom: "1px solid #eee",
    paddingVertical: 3,
  },
  tHeadRow: {
    flexDirection: "row",
    borderBottom: "1px solid #333",
    paddingVertical: 3,
    fontWeight: 700,
    fontSize: 8,
  },
  cDesc: { flex: 3 },
  cHsn: { flex: 1, textAlign: "center" },
  cQty: { flex: 1, textAlign: "right" },
  cRate: { flex: 1, textAlign: "right" },
  cAmt: { flex: 1.2, textAlign: "right" },
  cTaxPct: { flex: 0.8, textAlign: "right" },
  totalsBlock: { marginTop: 8, alignItems: "flex-end" },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: 220,
    paddingVertical: 1.5,
  },
  totalsLabel: { flex: 1, textAlign: "right", paddingRight: 8, color: "#555" },
  totalsValue: { width: 90, textAlign: "right" },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: 220,
    borderTop: "1px solid #333",
    marginTop: 2,
    paddingTop: 3,
  },
  amountWords: {
    marginTop: 8,
    fontSize: 8,
    fontStyle: "italic",
    color: "#333",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 28,
  },
  bankBlock: { flex: 1 },
  termsBlock: { flex: 1, paddingRight: 16 },
  sectionLabel: {
    fontSize: 7,
    textTransform: "uppercase",
    color: "#888",
    marginBottom: 3,
  },
  signatureBlock: { width: 140, alignItems: "center" },
  signatureImg: { width: 100, height: 40, objectFit: "contain" },
  signatureCaption: {
    fontSize: 7,
    color: "#666",
    marginTop: 4,
    borderTop: "1px solid #999",
    paddingTop: 2,
    width: "100%",
    textAlign: "center",
  },
  notes: { marginTop: 10, fontSize: 8, color: "#555" },
});

function money(n: number, currency: string): string {
  return `${currency === "INR" ? "₹" : currency + " "}${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function PartyCard({
  label,
  party,
}: {
  label: string;
  party: PartyRenderData;
}) {
  return (
    <View style={styles.partyCard}>
      <Text style={styles.partyLabel}>{label}</Text>
      <Text style={styles.partyName}>{party.name}</Text>
      {party.address && <Text style={styles.partyLine}>{party.address}</Text>}
      {party.taxId && (
        <Text style={styles.partyLine}>
          {party.taxIdType ?? "Tax ID"}: {party.taxId}
        </Text>
      )}
      <Text style={styles.partyLine}>{party.country}</Text>
    </View>
  );
}

/**
 * The rendered document tree. Consumed both client-side (live preview,
 * `pdf(<GeneratedInvoiceDocument .../>).toBlob()`) and server-side
 * (`renderToBuffer`) from the exact same component, so the two never drift.
 */
export function GeneratedInvoiceDocument({
  data,
  logoUrl,
  signatureUrl,
}: {
  data: InvoiceRenderData;
  /** Signed URL for the logo image, resolved by the caller (server or client). */
  logoUrl?: string | null;
  /** Signed URL for the signature image, resolved by the caller. */
  signatureUrl?: string | null;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.letterhead}>
            {logoUrl && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoUrl} style={styles.logo} />
            )}
            <Text style={styles.partyName}>
              {data.issuer.legalName ?? data.issuer.name}
            </Text>
            {data.issuer.address && (
              <Text style={styles.partyLine}>{data.issuer.address}</Text>
            )}
            {data.issuer.taxId && (
              <Text style={styles.partyLine}>
                {data.issuer.taxIdType ?? "Tax ID"}: {data.issuer.taxId}
              </Text>
            )}
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{INVOICE_DIRECTION_LABELS.purchase}</Text>
            {data.ourInvoiceNumber && (
              <Text style={styles.invoiceNo}>No. {data.ourInvoiceNumber}</Text>
            )}
            {data.ourInvoiceDate && (
              <Text style={styles.invoiceNo}>Date: {data.ourInvoiceDate}</Text>
            )}
          </View>
        </View>

        <View style={styles.partiesRow}>
          <PartyCard label="Vendor / Bill to" party={data.vendor} />
        </View>

        <View style={styles.table}>
          <View style={styles.tHeadRow}>
            <Text style={styles.cDesc}>Description</Text>
            <Text style={styles.cHsn}>HSN/SAC</Text>
            <Text style={styles.cQty}>Qty</Text>
            <Text style={styles.cRate}>Rate</Text>
            <Text style={styles.cTaxPct}>Tax %</Text>
            <Text style={styles.cAmt}>Amount</Text>
          </View>
          {data.lineItems.map((li, i) => (
            <View style={styles.tRow} key={i}>
              <Text style={styles.cDesc}>{li.description ?? ""}</Text>
              <Text style={styles.cHsn}>{li.hsn_sac ?? ""}</Text>
              <Text style={styles.cQty}>{li.quantity ?? ""}</Text>
              <Text style={styles.cRate}>
                {li.unit_price != null ? li.unit_price.toLocaleString("en-IN") : ""}
              </Text>
              <Text style={styles.cTaxPct}>{li.tax_rate ?? ""}</Text>
              <Text style={styles.cAmt}>
                {li.amount != null ? li.amount.toLocaleString("en-IN") : ""}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>
              {money(data.subtotal, data.currency)}
            </Text>
          </View>
          {data.taxes.map((t, i) => (
            <View style={styles.totalsRow} key={i}>
              <Text style={styles.totalsLabel}>
                {t.tax_type}
                {t.rate != null ? ` (${t.rate}%)` : ""}
              </Text>
              <Text style={styles.totalsValue}>{money(t.amount, data.currency)}</Text>
            </View>
          ))}
          <View style={styles.grandTotalRow}>
            <Text style={[styles.totalsLabel, { fontWeight: 700 }]}>Total</Text>
            <Text style={[styles.totalsValue, { fontWeight: 700 }]}>
              {money(data.total, data.currency)}
            </Text>
          </View>
        </View>

        <Text style={styles.amountWords}>{data.amountInWords}</Text>

        {data.notes && <Text style={styles.notes}>Notes: {data.notes}</Text>}

        <View style={styles.footerRow}>
          <View style={styles.termsBlock}>
            {data.termsAndConditions && (
              <>
                <Text style={styles.sectionLabel}>Terms &amp; Conditions</Text>
                <Text style={styles.partyLine}>{data.termsAndConditions}</Text>
              </>
            )}
          </View>
          {data.bank && (
            <View style={styles.bankBlock}>
              <Text style={styles.sectionLabel}>Payment Details</Text>
              {data.bank.accountName && (
                <Text style={styles.partyLine}>A/c name: {data.bank.accountName}</Text>
              )}
              {data.bank.accountNumber && (
                <Text style={styles.partyLine}>A/c no.: {data.bank.accountNumber}</Text>
              )}
              {data.bank.bankName && (
                <Text style={styles.partyLine}>Bank: {data.bank.bankName}</Text>
              )}
              {data.bank.ifsc && (
                <Text style={styles.partyLine}>IFSC: {data.bank.ifsc}</Text>
              )}
            </View>
          )}
          <View style={styles.signatureBlock}>
            {signatureUrl && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={signatureUrl} style={styles.signatureImg} />
            )}
            <Text style={styles.signatureCaption}>Authorized Signatory</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
