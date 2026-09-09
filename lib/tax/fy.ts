/** Indian financial year helpers (FY runs 1 April -> 31 March). */

export interface FinancialYear {
  /** e.g. 2025 for FY 2025-26 */
  startYear: number;
  /** "2025-26" */
  label: string;
  start: Date; // 1 Apr, local
  end: Date; // 1 Apr next year (exclusive)
}

export function financialYearOf(date: Date): FinancialYear {
  const y = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? y : y - 1; // month 3 === April
  return financialYearFromStart(startYear);
}

export function financialYearFromStart(startYear: number): FinancialYear {
  const start = new Date(startYear, 3, 1, 0, 0, 0, 0);
  const end = new Date(startYear + 1, 3, 1, 0, 0, 0, 0);
  const label = `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
  return { startYear, label, start, end, };
}

/** Fiscal quarter within the Indian FY: Q1 = Apr-Jun ... Q4 = Jan-Mar. */
export function fiscalQuarterOf(date: Date): { fy: string; quarter: 1 | 2 | 3 | 4 } {
  const fy = financialYearOf(date);
  const monthsSinceApril = (date.getMonth() - 3 + 12) % 12;
  const quarter = (Math.floor(monthsSinceApril / 3) + 1) as 1 | 2 | 3 | 4;
  return { fy: fy.label, quarter };
}

export function isInFinancialYear(date: Date, startYear: number): boolean {
  const fy = financialYearFromStart(startYear);
  return date >= fy.start && date < fy.end;
}
