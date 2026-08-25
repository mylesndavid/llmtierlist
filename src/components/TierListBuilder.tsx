"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  defaultDropAnimationSideEffects,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { saveTierList } from "@/lib/actions";
import { TIER_COLORS } from "@/lib/tiers";
import { TIERS, type Model, type Tier, type TierListItem } from "@/lib/types";
import ModelChip from "./ModelChip";
import VendorLogo from "./VendorLogo";
import FullscreenBoard from "./FullscreenBoard";

type ContainerId = Tier | "pool";
type Containers = Record<ContainerId, string[]>;

interface Props {
  models: Model[];
  listId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialIsPublic?: boolean;
  initialItems?: TierListItem[];
  signedIn: boolean;
}

const dropAnimation: DropAnimation = {
  duration: 220,
  easing: "cubic-bezier(0.2, 0.9, 0.3, 1.1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.35" } },
  }),
};

function SortableChip({
  model,
  onRemove,
  removeLabel,
  width = "",
}: {
  model: Model;
  onRemove?: () => void;
  removeLabel?: string;
  width?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: model.id,
      transition: { duration: 200, easing: "cubic-bezier(0.25, 1, 0.5, 1)" },
    });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative cursor-grab touch-none transition-shadow duration-150 active:cursor-grabbing ${width} ${
        isDragging
          ? "z-20 opacity-30"
          : "hover:z-10 hover:shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
      }`}
      {...attributes}
      {...listeners}
    >
      <ModelChip model={model} />
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          title={removeLabel}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -right-1.5 -top-1.5 z-20 hidden h-5 w-5 items-center justify-center rounded-full bg-black text-[11px] leading-none text-white shadow ring-1 ring-white/30 hover:bg-neutral-800 group-hover:flex"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function DroppableZone({
  id,
  children,
  className,
}: {
  id: ContainerId;
  children: React.ReactNode;
  className: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`${className} transition-colors duration-150 ${
        isOver ? "bg-white/[0.07] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]" : ""
      }`}
    >
      {children}
    </div>
  );
}

export default function TierListBuilder({
  models,
  listId,
  initialTitle = "",
  initialDescription = "",
  initialIsPublic = true,
  initialItems = [],
  signedIn,
}: Props) {
  const router = useRouter();
  const modelById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);

  const [containers, setContainers] = useState<Containers>(() => {
    const placed = new Set(initialItems.map((i) => i.model_id));
    const byTier = Object.fromEntries(TIERS.map((t) => [t, [] as string[]])) as Record<Tier, string[]>;
    for (const item of [...initialItems].sort((a, b) => a.position - b.position)) {
      if (modelById.has(item.model_id)) byTier[item.tier].push(item.model_id);
    }
    return {
      ...byTier,
      pool: models
        .filter((m) => !placed.has(m.id))
        .sort((a, b) => (b.release_date ?? "").localeCompare(a.release_date ?? ""))
        .map((m) => m.id),
    };
  });

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -- pool filters
  const [poolFilter, setPoolFilter] = useState("");
  const [filterMode, setFilterMode] = useState<"include" | "exclude">("include");
  const [selectedVendors, setSelectedVendors] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [labsOpen, setLabsOpen] = useState(false);
  const [maxAgeMonths, setMaxAgeMonths] = useState<number | null>(6);
  const [licenseFilter, setLicenseFilter] = useState<"all" | "open-weights" | "proprietary">("all");

  const ageCutoff = useMemo(() => {
    if (maxAgeMonths == null) return null;
    const d = new Date();
    d.setMonth(d.getMonth() - maxAgeMonths);
    return d.toISOString().slice(0, 10);
  }, [maxAgeMonths]);

  // Prefer tile-level collisions so rows part to show exactly where a drop
  // will land; fall back to the row itself when hovering empty space.
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointer = pointerWithin(args);
    const collisions = pointer.length > 0 ? pointer : rectIntersection(args);
    const chip = collisions.find((c) => {
      const id = String(c.id);
      return id !== "pool" && !(TIERS as readonly string[]).includes(id);
    });
    return chip ? [chip] : collisions;
  }, []);

  const vendors = useMemo(() => {
    const counts = new Map<string, { slug: string; name: string; count: number }>();
    for (const m of models) {
      const v = counts.get(m.vendor_slug);
      if (v) v.count++;
      else counts.set(m.vendor_slug, { slug: m.vendor_slug, name: m.vendor, count: 1 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }, [models]);

  function passesVendorFilter(m: Model): boolean {
    if (selectedVendors.size === 0) return true;
    const selected = selectedVendors.has(m.vendor_slug);
    return filterMode === "include" ? selected : !selected;
  }

  const visiblePool = containers.pool.filter((id) => {
    const m = modelById.get(id)!;
    if (hidden.has(id)) return false;
    if (!passesVendorFilter(m)) return false;
    if (licenseFilter !== "all" && m.license !== licenseFilter) return false;
    if (ageCutoff && (m.release_date ?? "") < ageCutoff) return false;
    if (poolFilter) {
      const q = poolFilter.toLowerCase();
      if (!m.name.toLowerCase().includes(q) && !m.vendor.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const hiddenCount = hidden.size;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } })
  );

  function findContainer(id: string): ContainerId | null {
    if (id === "pool" || (TIERS as readonly string[]).includes(id)) return id as ContainerId;
    for (const key of Object.keys(containers) as ContainerId[]) {
      if (containers[key].includes(id)) return key;
    }
    return null;
  }

  function moveToPool(modelId: string) {
    setContainers((prev) => {
      const from = (Object.keys(prev) as ContainerId[]).find((k) => k !== "pool" && prev[k].includes(modelId));
      if (!from) return prev;
      return {
        ...prev,
        [from]: prev[from].filter((id) => id !== modelId),
        pool: [modelId, ...prev.pool],
      };
    });
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeContainer = findContainer(String(active.id));
    const overContainer = findContainer(String(over.id));
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setContainers((prev) => {
      const activeItems = prev[activeContainer].filter((id) => id !== active.id);
      const overItems = [...prev[overContainer]];
      const overIndex = overItems.indexOf(String(over.id));
      const insertAt = overIndex >= 0 ? overIndex : overItems.length;
      overItems.splice(insertAt, 0, String(active.id));
      return { ...prev, [activeContainer]: activeItems, [overContainer]: overItems };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const activeContainer = findContainer(String(active.id));
    const overContainer = findContainer(String(over.id));
    if (!activeContainer || !overContainer || activeContainer !== overContainer) return;

    const items = containers[activeContainer];
    const oldIndex = items.indexOf(String(active.id));
    const newIndex = items.indexOf(String(over.id));
    if (oldIndex !== newIndex && newIndex >= 0) {
      setContainers((prev) => ({
        ...prev,
        [activeContainer]: arrayMove(prev[activeContainer], oldIndex, newIndex),
      }));
    }
  }

  async function handleSave() {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setSaving(true);
    setError(null);
    const placements = TIERS.flatMap((tier) =>
      containers[tier].map((modelId, position) => ({ modelId, tier, position }))
    );
    const result = await saveTierList({ id: listId, title, description, isPublic, placements });
    setSaving(false);
    if (result?.error) setError(result.error);
    else if (result?.slug) router.push(`/t/${result.slug}`);
  }

  const placedCount = TIERS.reduce((n, t) => n + containers[t].length, 0);
  const activeFilterCount =
    (selectedVendors.size > 0 ? 1 : 0) +
    (licenseFilter !== "all" ? 1 : 0) +
    (maxAgeMonths != null ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="My LLM tier list"
          maxLength={120}
          className="flex-1 rounded-sm border border-edge bg-surface px-3 py-2 text-lg font-semibold outline-none placeholder:text-muted focus:border-muted"
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="accent-white"
          />
          Public
        </label>
        <button
          onClick={handleSave}
          disabled={saving || placedCount === 0}
          className="rounded-sm bg-foreground px-5 py-2 font-semibold text-black hover:bg-white disabled:opacity-40"
        >
          {saving ? "Saving…" : signedIn ? "Save tier list" : "Sign in to save"}
        </button>
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Optional description — what's your ranking criteria?"
        rows={2}
        maxLength={1000}
        className="w-full rounded-sm border border-edge bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-muted"
      />
      {error && <p className="text-sm text-rose-400">{error}</p>}

      <FullscreenBoard title={title || "New tier list"}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* tier board */}
        <div data-export-board className="border border-black/60 bg-black/60">
          {TIERS.map((tier) => (
            <div key={tier} className="flex min-h-20 border-b border-black/60 last:border-b-0">
              <div
                className="flex w-20 shrink-0 items-center justify-center p-2 text-center text-lg font-bold text-black sm:w-24"
                style={{ backgroundColor: TIER_COLORS[tier] }}
              >
                {tier}
              </div>
              <SortableContext items={containers[tier]} strategy={rectSortingStrategy}>
                <DroppableZone id={tier} className="flex flex-1 flex-wrap content-start items-start bg-surface">
                  {containers[tier].map((id) => (
                    <SortableChip
                      key={id}
                      model={modelById.get(id)!}
                      onRemove={() => moveToPool(id)}
                      removeLabel="Remove from tier"
                      width="w-36"
                    />
                  ))}
                </DroppableZone>
              </SortableContext>
            </div>
          ))}
        </div>

        {/* pool */}
        <div className="border border-edge bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-edge p-2.5">
            <h3 className="mr-auto text-sm font-semibold">
              Pool{" "}
              <span className="font-normal text-muted">
                {visiblePool.length} of {containers.pool.length}
              </span>
            </h3>
            <input
              value={poolFilter}
              onChange={(e) => setPoolFilter(e.target.value)}
              placeholder="Search models…"
              className="w-48 rounded-sm border border-edge bg-surface-2 px-2.5 py-1.5 text-sm outline-none placeholder:text-muted focus:border-muted"
            />
            <button
              type="button"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={`rounded-sm border px-3 py-1.5 text-sm font-medium transition-colors ${
                activeFilterCount > 0 || filtersOpen
                  ? "border-foreground bg-foreground text-black"
                  : "border-edge text-muted hover:border-muted hover:text-foreground"
              }`}
            >
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setHidden(new Set())}
                className="rounded-sm border border-edge px-3 py-1.5 text-sm text-muted hover:border-muted hover:text-foreground"
              >
                Restore {hiddenCount} hidden
              </button>
            )}
          </div>

          {filtersOpen && (
            <div className="space-y-3 border-b border-edge bg-surface-2/50 p-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <label className="flex items-center gap-2 text-muted">
                  Released within
                  <select
                    value={maxAgeMonths ?? "all"}
                    onChange={(e) =>
                      setMaxAgeMonths(e.target.value === "all" ? null : Number(e.target.value))
                    }
                    className="rounded-sm border border-edge bg-surface-2 px-2 py-1.5 text-sm text-foreground outline-none focus:border-muted"
                  >
                    <option value="3">3 months</option>
                    <option value="6">6 months</option>
                    <option value="12">12 months</option>
                    <option value="24">2 years</option>
                    <option value="all">All time</option>
                  </select>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-muted">Weights</span>
                  <div className="flex overflow-hidden rounded-sm border border-edge">
                    {(
                      [
                        ["all", "Any"],
                        ["open-weights", "Open"],
                        ["proprietary", "Closed"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setLicenseFilter(value)}
                        className={`px-3 py-1.5 font-medium transition-colors ${
                          licenseFilter === value
                            ? "bg-foreground text-black"
                            : "text-muted hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setLabsOpen(!labsOpen)}
                  className="flex items-center gap-1.5 text-muted transition-colors hover:text-foreground"
                >
                  <span className={`inline-block transition-transform ${labsOpen ? "rotate-90" : ""}`}>
                    ▸
                  </span>
                  Labs
                  <span className="font-medium text-foreground">
                    {selectedVendors.size === 0
                      ? "All"
                      : `${selectedVendors.size} ${filterMode === "include" ? "included" : "excluded"}`}
                  </span>
                </button>
                {labsOpen && (
                  <>
                    <div className="ml-2 flex overflow-hidden rounded-sm border border-edge">
                      {(["include", "exclude"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setFilterMode(mode)}
                          className={`px-3 py-1.5 font-medium capitalize transition-colors ${
                            filterMode === mode
                              ? "bg-foreground text-black"
                              : "text-muted hover:text-foreground"
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                    {selectedVendors.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedVendors(new Set())}
                        className="text-muted underline hover:text-foreground"
                      >
                        Clear
                      </button>
                    )}
                  </>
                )}
              </div>
              {labsOpen && (
              <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                {vendors.map((v) => {
                  const active = selectedVendors.has(v.slug);
                  return (
                    <button
                      key={v.slug}
                      type="button"
                      onClick={() =>
                        setSelectedVendors((prev) => {
                          const next = new Set(prev);
                          if (next.has(v.slug)) next.delete(v.slug);
                          else next.add(v.slug);
                          return next;
                        })
                      }
                      className={`flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-foreground bg-foreground text-black"
                          : "border-edge bg-surface text-muted hover:border-muted hover:text-foreground"
                      }`}
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded-[2px] bg-neutral-900 p-px">
                        <VendorLogo vendorSlug={v.slug} className="h-full w-full" />
                      </span>
                      {v.name}
                      <span className={active ? "text-black/60" : "text-muted/70"}>{v.count}</span>
                    </button>
                  );
                })}
              </div>
              )}
            </div>
          )}

          <SortableContext items={visiblePool} strategy={rectSortingStrategy}>
            <DroppableZone
              id="pool"
              className="grid max-h-[420px] min-h-20 grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] content-start overflow-y-auto"
            >
              {visiblePool.length === 0 ? (
                <span className="col-span-full self-center px-3 py-6 text-sm text-muted">
                  {containers.pool.length === 0
                    ? "Everything is ranked. Nice."
                    : "No models match your filters."}
                </span>
              ) : (
                visiblePool.map((id) => (
                  <SortableChip
                    key={id}
                    model={modelById.get(id)!}
                    onRemove={() => setHidden((prev) => new Set(prev).add(id))}
                    removeLabel="Hide from pool"
                  />
                ))
              )}
            </DroppableZone>
          </SortableContext>
        </div>

        <DragOverlay dropAnimation={dropAnimation}>
          {activeId && modelById.has(activeId) ? (
            <div className="w-36 scale-110 cursor-grabbing shadow-[0_12px_32px_rgba(0,0,0,0.7)] ring-2 ring-white/40">
              <ModelChip model={modelById.get(activeId)!} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      </FullscreenBoard>
    </div>
  );
}
