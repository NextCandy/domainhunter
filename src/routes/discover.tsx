import { createFileRoute } from "@tanstack/react-router";
import { DiscoverView } from "@/components/discover-view";

export const Route = createFileRoute("/discover")({
  validateSearch: (s: Record<string, unknown>) => ({
    status: typeof s.status === "string" ? s.status : undefined,
  }),
  component: () => {
    const { status } = Route.useSearch();
    return (
      <DiscoverView
        title="发现域名"
        presetStatuses={status ? [status] : undefined}
      />
    );
  },
});
