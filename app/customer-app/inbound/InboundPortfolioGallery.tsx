import Image from "next/image";

const portfolioImages = [
  {
    src: "/inbound-gallery/one-piece1.jpg",
    width: 1206,
    height: 1114,
    className: "h-40 w-full rounded-2xl object-cover",
    sizes: "(max-width: 448px) calc(50vw - 38px), 190px",
    wrapperClassName: undefined,
  },
  {
    src: "/inbound-gallery/attack-on-titan.jpeg",
    width: 623,
    height: 805,
    className: "h-40 w-full rounded-2xl object-cover",
    sizes: "(max-width: 448px) calc(50vw - 38px), 190px",
    wrapperClassName: undefined,
  },
  {
    src: "/inbound-gallery/demon-slayer.jpeg",
    width: 525,
    height: 502,
    className: "h-40 w-full rounded-2xl object-cover",
    sizes: "(max-width: 448px) calc(50vw - 38px), 190px",
    wrapperClassName: undefined,
  },
  {
    src: "/inbound-gallery/jojo.jpeg",
    width: 578,
    height: 819,
    className: "h-40 w-full rounded-2xl object-cover",
    sizes: "(max-width: 448px) calc(50vw - 38px), 190px",
    wrapperClassName: undefined,
  },
  {
    src: "/inbound-gallery/dragon-ball.jpeg",
    width: 1206,
    height: 1175,
    className: "h-72 w-full rounded-2xl bg-white object-contain",
    sizes: "(max-width: 448px) calc(100vw - 64px), 384px",
    wrapperClassName: "col-span-2",
  },
] as const;

type InboundPortfolioGalleryProps = {
  captions: readonly string[];
};

export default function InboundPortfolioGallery({
  captions,
}: InboundPortfolioGalleryProps) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      {portfolioImages.map((image, index) => (
        <div key={image.src} className={image.wrapperClassName}>
          <Image
            src={image.src}
            alt={captions[index] ?? `Nail design ${index + 1}`}
            width={image.width}
            height={image.height}
            sizes={image.sizes}
            className={image.className}
          />
          <div className="mt-2 text-center text-xs font-bold">
            {captions[index]}
          </div>
        </div>
      ))}
    </div>
  );
}
