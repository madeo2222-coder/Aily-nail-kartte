type VeriTransConfig = {
  merchantCcid: string;
  merchantSecret: string;
  tokenApiKey: string;
  dummy: string;
  appUrl: string;
};

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} が設定されていません`);
  }

  return value;
}

function normalizeAppUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeDummy(value: string | undefined) {
  return value === "0" ? "0" : "1";
}

export function getVeriTransConfig(): VeriTransConfig {
  const merchantCcid = getRequiredEnv("VERITRANS_MERCHANT_CCID");
  const merchantSecret = getRequiredEnv("VERITRANS_MERCHANT_SECRET");
  const tokenApiKey = getRequiredEnv("VERITRANS_TOKEN_API_KEY");

  const appUrl = normalizeAppUrl(
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
      ""
  );

  if (!appUrl) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL または VERCEL_PROJECT_PRODUCTION_URL が設定されていません"
    );
  }

  const normalizedAppUrl = /^https?:\/\//i.test(appUrl)
    ? appUrl
    : `https://${appUrl}`;

  return {
    merchantCcid,
    merchantSecret,
    tokenApiKey,
    dummy: normalizeDummy(process.env.VERITRANS_DUMMY),
    appUrl: normalizedAppUrl,
  };
}

export function getVeriTransTokenApiKey() {
  return getRequiredEnv("VERITRANS_TOKEN_API_KEY");
}