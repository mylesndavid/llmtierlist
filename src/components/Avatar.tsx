/* eslint-disable @next/next/no-img-element */

export default function Avatar({
  src,
  name,
  size = 32,
}: {
  src: string | null | undefined;
  name: string;
  size?: number;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-surface-2 font-bold uppercase text-muted"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {name.slice(0, 2)}
    </span>
  );
}
