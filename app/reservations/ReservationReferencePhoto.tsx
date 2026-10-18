import Image from "next/image";

type ReservationReferencePhotoProps = {
  src: string;
  sizes: string;
};

export default function ReservationReferencePhoto({
  src,
  sizes,
}: ReservationReferencePhotoProps) {
  return (
    <Image
      src={src}
      alt="Aily Gallery参考デザイン"
      fill
      sizes={sizes}
      className="object-cover"
    />
  );
}
