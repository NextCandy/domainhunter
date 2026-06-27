import { CurrentTask } from "./current-task";
import { Footer, Header, ReferenceTable } from "./common";
import { NewTask } from "./new-task";
import { SingleLookup } from "./single-lookup";

export function BatchRdapPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-8 pb-24">
        <SingleLookup />
        <NewTask />
        <CurrentTask />
        <ReferenceTable />
        <Footer />
      </main>
    </div>
  );
}
