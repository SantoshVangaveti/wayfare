"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchUser } from "@/app/actions";
import { cn } from "@/lib/utils";

export function UserSwitcher({
  users,
  currentUserId,
}: {
  users: { id: string; name: string; avatar: string | null }[];
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const current = users.find((u) => u.id === currentUserId);

  return (
    <label className="flex items-center gap-2">
      <span className="flex size-7 items-center justify-center rounded-full bg-sea font-poppins text-xs font-semibold text-white">
        {current?.avatar ?? current?.name?.[0] ?? "?"}
      </span>
      <select
        aria-label="Current user"
        value={currentUserId}
        disabled={pending}
        onChange={(e) =>
          startTransition(async () => {
            await switchUser(e.target.value);
            router.refresh();
          })
        }
        className={cn(
          "rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink",
          pending && "opacity-60",
        )}
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </label>
  );
}
