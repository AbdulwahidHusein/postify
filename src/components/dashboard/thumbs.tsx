import { ImageIcon } from "lucide-react";

/** Up to three overlapping product thumbnails, for orders with several items. */
export function Thumbs({ images, size = 36 }: { images: (string | null)[]; size?: number }) {
  const shown = images.slice(0, 3);
  const extra = images.length - shown.length;
  return (
    <span className="flex shrink-0 items-center">
      {shown.map((src, i) => (
        <span
          key={i}
          className="grid shrink-0 place-items-center overflow-hidden rounded-[9px] bg-sunken ring-2 ring-surface"
          style={{ width: size, height: size, marginLeft: i ? -size * 0.42 : 0, zIndex: 3 - i }}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon size={size * 0.4} className="text-faint" />
          )}
        </span>
      ))}
      {extra > 0 ? <span className="num ml-1 text-xs font-semibold text-mist">+{extra}</span> : null}
    </span>
  );
}
