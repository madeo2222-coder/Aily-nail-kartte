import Image from "next/image";

type CustomerPhotoProps = {
  src: string;
  alt: string;
  sizes: string;
};

export default function CustomerPhoto({
  src,
  alt,
  sizes,
}: CustomerPhotoProps) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className="object-cover"
    />
  );
}
