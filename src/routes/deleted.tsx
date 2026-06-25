import { createFileRoute } from "@tanstack/react-router";
import { DiscoverView } from "@/components/discover-view";

export const Route = createFileRoute("/deleted")({
  component: () => (
    <DiscoverView
      title="已删除域名"
      presetStatuses={["deleted", "available"]}
    />
  ),
});
