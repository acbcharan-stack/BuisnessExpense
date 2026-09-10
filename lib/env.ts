/**
 * Centralised, validated access to environment variables.
 *
 * Values are read lazily (via getters) so that `next build` does not crash when
 * a var is absent — the error is raised only when the value is actually needed
 * at request time.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

export const publicEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get siteUrl() {
    return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  },
  get homeCountry() {
    return process.env.NEXT_PUBLIC_HOME_COUNTRY ?? "IN";
  },
  get homeGstStateCode() {
    return process.env.NEXT_PUBLIC_HOME_GST_STATE_CODE ?? "33";
  },
};

/** Only call this from server-side code. */
export function getServerEnv() {
  return {
    supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    geminiApiKey: required("GEMINI_API_KEY"),
    geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
    inboundEmailSecret: process.env.INBOUND_EMAIL_SECRET ?? "",
    inboundEmailAllowlist: (process.env.INBOUND_EMAIL_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    cronSecret: process.env.CRON_SECRET ?? "",
    companyGstin: process.env.COMPANY_GSTIN ?? "",
  };
}
