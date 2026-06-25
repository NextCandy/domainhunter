import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Route as DiscoverRoute } from "./discover";

export const Route = createFileRoute("/deleted")({
  component: () => (
    <AppShell>
      <PageHeader title="已删除域名" description="已经删除、理论上可以重新注册的域名。" actions={<Link {...DiscoverRoute.linkOptions({ to: "/discover", search: { status: "deleted" } })} className="btn-base btn-ghost">高级筛选</Link>} />
      <RedirectToDiscover status="deleted" />
    </AppShell>
  ),
});

function RedirectToDiscover({ status }: { status: string }) {
  if (typeof window !== "undefined") {
    window.location.replace(`/discover?status=${status}`);
  }
  return <div className="card-elev p-8 text-center text-sm text-muted-foreground">跳转到发现页…</div>;
}
