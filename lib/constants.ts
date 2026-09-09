/**
 * Seed data for a CNC machine shop / precision engineering business.
 * `zohoAccount` is the default Zoho Books expense account each category maps to;
 * users can re-map these in Settings later.
 */
export const SEED_CATEGORIES: {
  name: string;
  zohoAccount: string;
  defaultRecordType: "invoice" | "expense";
}[] = [
  { name: "Raw Material – Metal/Bar Stock", zohoAccount: "Cost of Goods Sold", defaultRecordType: "invoice" },
  { name: "Tooling & Inserts", zohoAccount: "Consumables", defaultRecordType: "invoice" },
  { name: "Cutting Fluid/Coolant", zohoAccount: "Consumables", defaultRecordType: "invoice" },
  { name: "Consumables", zohoAccount: "Consumables", defaultRecordType: "invoice" },
  { name: "Machine Spares", zohoAccount: "Repairs and Maintenance", defaultRecordType: "invoice" },
  { name: "Machine Maintenance/AMC", zohoAccount: "Repairs and Maintenance", defaultRecordType: "invoice" },
  { name: "Subcontract / Job Work", zohoAccount: "Subcontracting Expense", defaultRecordType: "invoice" },
  { name: "Calibration & Testing", zohoAccount: "Professional Fees", defaultRecordType: "invoice" },
  { name: "Electricity (HT)", zohoAccount: "Electricity Expense", defaultRecordType: "expense" },
  { name: "Factory Rent", zohoAccount: "Rent Expense", defaultRecordType: "expense" },
  { name: "Wages/Labour", zohoAccount: "Wages", defaultRecordType: "expense" },
  { name: "Freight & Transport", zohoAccount: "Freight and Postage", defaultRecordType: "invoice" },
  { name: "Fuel", zohoAccount: "Fuel/Mileage Expenses", defaultRecordType: "expense" },
  { name: "Office Supplies", zohoAccount: "Office Supplies", defaultRecordType: "expense" },
  { name: "Telecom/Internet", zohoAccount: "Telephone Expense", defaultRecordType: "expense" },
  { name: "Professional Fees", zohoAccount: "Professional Fees", defaultRecordType: "invoice" },
  { name: "Bank Charges", zohoAccount: "Bank Fees and Charges", defaultRecordType: "expense" },
  { name: "Misc", zohoAccount: "Other Expenses", defaultRecordType: "expense" },
];

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB per file
export const MAX_PDF_PAGES = 30;
export const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

export const STORAGE_BUCKET = "documents";
