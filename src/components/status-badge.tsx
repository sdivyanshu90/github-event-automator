export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status.replaceAll("_", "-")}`}>{status.replaceAll("_", " ")}</span>;
}
