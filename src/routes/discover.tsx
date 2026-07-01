import { createFileRoute } from "@tanstack/react-router";
import { DiscoverView } from "@/components/discover-view";

export const Route = createFileRoute("/discover")({
  validateSearch: (s: Record<string, unknown>) => ({
    status: typeof s.status === "string" ? s.status : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  component: DiscoverRouteComponent,
});

function DiscoverRouteComponent() {
  const { status, q } = Route.useSearch();
  return (
    <DiscoverView
      title="Hunt 狩猎终端"
      presetStatuses={status ? [status] : undefined}
      initialQuery={q}
    />
  );
}
