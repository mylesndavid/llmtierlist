const MINUTE = 60, HOUR = 3600, DAY = 86400;

/** Relative age plus the exact date on hover — tier lists are snapshots in time. */
export default function TimeAgo({ iso, prefix = "" }: { iso: string; prefix?: string }) {
  const date = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const secs = Math.max(0, (Date.now() - date.getTime()) / 1000);

  let label: string;
  if (secs < MINUTE) label = "just now";
  else if (secs < HOUR) label = `${Math.floor(secs / MINUTE)}m ago`;
  else if (secs < DAY) label = `${Math.floor(secs / HOUR)}h ago`;
  else if (secs < DAY * 30) label = `${Math.floor(secs / DAY)}d ago`;
  else if (secs < DAY * 365) label = `${Math.floor(secs / (DAY * 30))}mo ago`;
  else label = `${Math.floor(secs / (DAY * 365))}y ago`;

  return (
    <time
      dateTime={date.toISOString()}
      title={date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
    >
      {prefix}
      {label}
    </time>
  );
}
