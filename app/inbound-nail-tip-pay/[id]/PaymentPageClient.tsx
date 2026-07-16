"use client";

import { FormEvent, useMemo, useState } from "react";

type Props = {
  requestId: string;
  customerName: string;
  amount: number;
  tokenApiKey: string;
};

type TokenApiResponse = {
  token?: string;
  token_expire_date?: string;
  status?: string;
  code?: string;
  message?: string;
};

function onlyNumbers(value: string) {
  return value.replace(/\D/g, "");
}

function formatCardNumber(value: string) {
  return onlyNumbers(value)
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, "$1 ");
}

function normalizeExpiration(value: string) {
  const numbers = onlyNumbers(value).slice(0, 4);

  if (numbers.length <= 2) {
    return numbers;
  }

  return `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
}

function getExpirationForTokenApi(value: string) {
  const numbers = onlyNumbers(value);

  if (numbers.length !== 4) {
    return "";
  }

  const month = numbers.slice(0, 2);
  const year = numbers.slice(2, 4);

  return `${month}/${year}`;
}

async function createCardToken(params: {
  tokenApiKey: string;
  cardNumber: string;
  expiration: string;
  securityCode: string;
  cardholderName: string;
}) {
  const response = await fetch("https://api.veritrans.co.jp/4gtoken", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      token_api_key: params.tokenApiKey,
      card_number: onlyNumbers(params.cardNumber),
      card_expire: getExpirationForTokenApi(params.expiration),
      security_code: onlyNumbers(params.securityCode),
      cardholder_name: params.cardholderName.trim(),
      lang: "ja",
    }),
  });

  const responseText = await response.text();

  let data: TokenApiResponse;

  try {
    data = JSON.parse(responseText) as TokenApiResponse;
  } catch {
    throw new Error(
      "カード情報の確認処理で正常な応答を受信できませんでした"
    );
  }

  if (!response.ok || !data.token) {
    throw new Error(
      data.message ||
        data.code ||
        "カード情報を確認できませんでした"
    );
  }

  return data.token;
}

export default function PaymentPageClient({
  requestId,
  customerName,
  amount,
  tokenApiKey,
}: Props) {
  const [cardNumber, setCardNumber] = useState("");
  const [expiration, setExpiration] = useState("");
  const [securityCode, setSecurityCode] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const formattedAmount = useMemo(
    () => amount.toLocaleString("ja-JP"),
    [amount]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (processing) {
      return;
    }

    setErrorMessage("");

    const normalizedCardNumber = onlyNumbers(cardNumber);
    const normalizedExpiration = onlyNumbers(expiration);
    const normalizedSecurityCode = onlyNumbers(securityCode);
    const normalizedCardholderName = cardholderName.trim();

    if (
      normalizedCardNumber.length < 14 ||
      normalizedCardNumber.length > 16
    ) {
      setErrorMessage("カード番号を確認してください");
      return;
    }

    if (normalizedExpiration.length !== 4) {
      setErrorMessage("有効期限を月2桁・年2桁で入力してください");
      return;
    }

    const expirationMonth = Number(
      normalizedExpiration.slice(0, 2)
    );

    if (
      !Number.isInteger(expirationMonth) ||
      expirationMonth < 1 ||
      expirationMonth > 12
    ) {
      setErrorMessage("有効期限の月を確認してください");
      return;
    }

    if (
      normalizedSecurityCode.length < 3 ||
      normalizedSecurityCode.length > 4
    ) {
      setErrorMessage("セキュリティコードを確認してください");
      return;
    }

    if (!normalizedCardholderName) {
      setErrorMessage("カード名義を入力してください");
      return;
    }

    setProcessing(true);

    try {
      const token = await createCardToken({
        tokenApiKey,
        cardNumber: normalizedCardNumber,
        expiration: normalizedExpiration,
        securityCode: normalizedSecurityCode,
        cardholderName: normalizedCardholderName,
      });

      const response = await fetch(
        `/api/inbound-nail-tip-requests/${encodeURIComponent(
          requestId
        )}/pay`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
          }),
        }
      );

      const responseText = await response.text();

      let data: {
        ok?: boolean;
        error?: string;
      };

      try {
        data = JSON.parse(responseText) as {
          ok?: boolean;
          error?: string;
        };
      } catch {
        throw new Error("決済処理で正常な応答を受信できませんでした");
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "カード決済に失敗しました");
      }

      setCompleted(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "カード決済に失敗しました"
      );
    } finally {
      setProcessing(false);
    }
  }

  if (completed) {
    return (
      <main className="min-h-screen bg-stone-50 px-4 py-10">
        <div className="mx-auto max-w-lg rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
            ✓
          </div>

          <p className="mt-5 text-sm font-bold text-emerald-600">
            Payment completed
          </p>

          <h1 className="mt-2 text-2xl font-bold text-stone-900">
            お支払いが完了しました
          </h1>

          <p className="mt-3 text-sm leading-6 text-stone-600">
            ありがとうございます。ご入金を確認後、ネイルチップの制作を開始します。
          </p>

          <div className="mt-6 rounded-2xl bg-emerald-50 p-4">
            <div className="text-sm text-emerald-700">
              お支払い金額
            </div>

            <div className="mt-1 text-3xl font-bold text-emerald-900">
              ¥{formattedAmount}
            </div>
          </div>

          <p className="mt-6 text-sm text-stone-500">
            Aily Nail Studio
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <p className="text-sm font-bold tracking-[0.2em] text-stone-500">
            AILY NAIL STUDIO
          </p>

          <h1 className="mt-3 text-2xl font-bold text-stone-900">
            ネイルチップのお支払い
          </h1>
        </div>

        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="rounded-2xl bg-stone-100 p-4">
            <div className="text-sm text-stone-500">お客様</div>

            <div className="mt-1 font-bold text-stone-900">
              {customerName}
            </div>

            <div className="mt-5 text-sm text-stone-500">
              お支払い金額
            </div>

            <div className="mt-1 text-3xl font-bold text-stone-900">
              ¥{formattedAmount}
            </div>
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="card-number"
                className="mb-2 block text-sm font-bold text-stone-700"
              >
                カード番号
              </label>

              <input
                id="card-number"
                type="text"
                inputMode="numeric"
                autoComplete="cc-number"
                value={cardNumber}
                onChange={(event) =>
                  setCardNumber(formatCardNumber(event.target.value))
                }
                placeholder="1234 5678 9012 3456"
                disabled={processing}
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none transition focus:border-stone-700 disabled:bg-stone-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="expiration"
                  className="mb-2 block text-sm font-bold text-stone-700"
                >
                  有効期限
                </label>

                <input
                  id="expiration"
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  value={expiration}
                  onChange={(event) =>
                    setExpiration(
                      normalizeExpiration(event.target.value)
                    )
                  }
                  placeholder="MM/YY"
                  disabled={processing}
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none transition focus:border-stone-700 disabled:bg-stone-100"
                />
              </div>

              <div>
                <label
                  htmlFor="security-code"
                  className="mb-2 block text-sm font-bold text-stone-700"
                >
                  セキュリティコード
                </label>

                <input
                  id="security-code"
                  type="password"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  value={securityCode}
                  onChange={(event) =>
                    setSecurityCode(
                      onlyNumbers(event.target.value).slice(0, 4)
                    )
                  }
                  placeholder="123"
                  disabled={processing}
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none transition focus:border-stone-700 disabled:bg-stone-100"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="cardholder-name"
                className="mb-2 block text-sm font-bold text-stone-700"
              >
                カード名義
              </label>

              <input
                id="cardholder-name"
                type="text"
                autoComplete="cc-name"
                value={cardholderName}
                onChange={(event) =>
                  setCardholderName(event.target.value.toUpperCase())
                }
                placeholder="TARO YAMADA"
                disabled={processing}
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base uppercase outline-none transition focus:border-stone-700 disabled:bg-stone-100"
              />
            </div>

            {errorMessage ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={processing}
              className="w-full rounded-xl bg-stone-900 px-4 py-4 text-base font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
            >
              {processing
                ? "決済処理中..."
                : `¥${formattedAmount}を支払う`}
            </button>
          </form>

          <div className="mt-5 rounded-xl bg-stone-50 px-4 py-3 text-xs leading-5 text-stone-500">
            カード情報はAily Nail Studioのサーバには保存されません。
            決済処理はDGフィナンシャルテクノロジーの決済システムを利用します。
          </div>
        </div>
      </div>
    </main>
  );
}