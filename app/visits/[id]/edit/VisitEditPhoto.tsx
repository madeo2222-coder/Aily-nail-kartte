import Image from "next/image";

type VisitEditPhotoProps = {
  src: string;
  alt: string;
  unoptimized?: boolean;
};

export default function VisitEditPhoto({
  src,
  alt,
  unoptimized = false,
}: VisitEditPhotoProps) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="(max-width: 640px) calc(50vw - 30px), 202px"
      className="rounded-lg object-cover"
      unoptimized={unoptimized}
    />
  );
}
