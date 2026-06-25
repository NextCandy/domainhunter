import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/pending")({
  component: () => {
    useEffect(() => { window.location.replace("/discover?status=pending_delete"); }, []);
    return <div className="p-10 text-center text-sm text-muted-foreground">跳转到发现页…</div>;
  },
});
