import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function FilterBar({
  children,
  onSubmit,
  className,
}: {
  children: React.ReactNode;
  onSubmit?: (event: React.FormEvent) => void;
  className?: string;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(event);
      }}
      className={cn(
        "mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-card",
        className,
      )}
    >
      {children}
    </form>
  );
}

export function FilterField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function TableSkeletonRows({
  columns,
  rows = 6,
}: {
  columns: number;
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-b">
          {Array.from({ length: columns }).map((__, colIndex) => (
            <td key={colIndex} className="px-3 py-3">
              <div
                className="h-4 animate-pulse rounded bg-muted"
                style={{ width: `${55 + ((rowIndex * 7 + colIndex * 13) % 40)}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
