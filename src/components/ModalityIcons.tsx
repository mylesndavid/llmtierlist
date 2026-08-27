/** Icons for model input/output modalities. */
const paths: Record<string, string> = {
  text: "M4 7V5h16v2M9 5v14M15 5v14M7 19h10",
  image: "M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6",
  video: "M3 6h13v12H3zM16 10l5-3v10l-5-3",
  audio: "M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2",
  file: "M6 3h8l4 4v14H6zM14 3v5h5",
};

const labels: Record<string, string> = {
  text: "Text",
  image: "Image",
  video: "Video",
  audio: "Audio",
  file: "File",
};

export default function ModalityIcon({ kind, size = 14 }: { kind: string; size?: number }) {
  const d = paths[kind] ?? paths.file;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={labels[kind] ?? kind}
    >
      <title>{labels[kind] ?? kind}</title>
      <path d={d} />
    </svg>
  );
}
