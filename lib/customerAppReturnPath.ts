const CUSTOMER_APP_ROOT = "/customer-app";

export function getSafeCustomerAppReturnPath(
  value: string | null | undefined
) {
  if (!value) return CUSTOMER_APP_ROOT;
  if (value.includes("\\")) return CUSTOMER_APP_ROOT;
  if (value !== CUSTOMER_APP_ROOT && !value.startsWith(`${CUSTOMER_APP_ROOT}/`)) {
    return CUSTOMER_APP_ROOT;
  }

  return value;
}
