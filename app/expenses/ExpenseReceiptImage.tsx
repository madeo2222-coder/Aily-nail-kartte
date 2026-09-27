import Image from "next/image";

type ExpenseReceiptImageProps = {
  src: string;
  variant: "detail" | "list" | "report";
};

const variants = {
  detail: {
    width: 1200,
    height: 1600,
    sizes: "(max-width: 768px) calc(100vw - 2rem), 768px",
    className: "h-auto w-full rounded-xl border object-contain",
  },
  list: {
    width: 440,
    height: 280,
    sizes: "(max-width: 768px) min(220px, 100vw), 220px",
    className: "h-[140px] w-full object-cover",
  },
  report: {
    width: 280,
    height: 192,
    sizes: "140px",
    className: "h-[96px] w-full rounded-xl border object-cover",
  },
} as const;

export default function ExpenseReceiptImage({
  src,
  variant,
}: ExpenseReceiptImageProps) {
  const props = variants[variant];

  return <Image src={src} alt="レシート" {...props} />;
}
