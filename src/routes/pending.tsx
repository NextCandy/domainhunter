import { createFileRoute } from "@tanstack/react-router";
import { DiscoverView } from "@/components/discover-view";

export const Route = createFileRoute("/pending")({
  component: () => (
    <DiscoverView
      title="待删除域名"
      presetStatuses={["pending_delete"]}
    />
  ),
});
