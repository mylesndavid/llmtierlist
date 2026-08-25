import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getMyTierLists } from "@/lib/data";
import { deleteTierList } from "@/lib/actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Tier Lists" };

export default async function MyTierListsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const lists = await getMyTierLists();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My tier lists</h1>
          <p className="mt-1 text-sm text-muted">
            {lists.length} {lists.length === 1 ? "list" : "lists"}
          </p>
        </div>
        <Link
          href="/tierlists/new"
          className="rounded-sm bg-foreground px-4 py-2 text-sm font-semibold text-black hover:bg-white"
        >
          + New tier list
        </Link>
      </div>

      {lists.length === 0 ? (
        <p className="py-16 text-center text-muted">
          You haven&apos;t made a tier list yet.{" "}
          <Link href="/tierlists/new" className="underline hover:text-foreground">
            Build your first one.
          </Link>
        </p>
      ) : (
        <div className="overflow-hidden border border-edge">
          {lists.map((list) => (
            <div
              key={list.id}
              className="flex items-center gap-4 border-b border-edge bg-surface px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <Link href={`/t/${list.slug}`} className="font-semibold hover:underline">
                  {list.title}
                </Link>
                <p className="text-xs text-muted">
                  {list.is_public ? "Public" : "Private"} · updated{" "}
                  {new Date(list.updated_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
              <Link
                href={`/t/${list.slug}/edit`}
                className="text-sm text-muted hover:text-foreground"
              >
                Edit
              </Link>
              <form
                action={async () => {
                  "use server";
                  await deleteTierList(list.id);
                }}
              >
                <button className="text-sm text-muted hover:text-rose-400" type="submit">
                  Delete
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
