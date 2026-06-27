import type { HTMLAttributes } from "react";

type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className = "", ...props }: SkeletonProps) {
  return <div aria-hidden="true" className={`skeleton rounded-md ${className}`} {...props} />;
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card-elev p-4">
      <Skeleton className="h-4 w-2/3" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={i === lines - 1 ? "h-3 w-1/2" : "h-3 w-full"} />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, row) => (
        <tr key={row} className="border-t border-border">
          {Array.from({ length: cols }).map((__, col) => (
            <td key={col} className="px-3 py-3">
              <Skeleton className="h-3 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
