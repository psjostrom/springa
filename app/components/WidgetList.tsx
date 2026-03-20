"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Eye, EyeOff, Pencil } from "lucide-react";
import type { ModalWidgetId, WidgetProps } from "@/lib/modalWidgets";
import { COMPLETED_RUN_WIDGETS } from "@/lib/modalWidgets";
import { WidgetCard } from "./WidgetCard";

type WidgetRenderMap = Record<ModalWidgetId, (props: WidgetProps) => React.ReactNode | null>;

interface WidgetListProps {
  order: ModalWidgetId[];
  hidden: ModalWidgetId[];
  widgetProps: WidgetProps;
  renderMap: WidgetRenderMap;
  onReorder: (newOrder: ModalWidgetId[]) => void;
  onToggle: (widgetId: ModalWidgetId) => void;
  /** Optional section headings rendered above the WidgetCard for specific widgets */
  sectionHeadings?: Partial<Record<ModalWidgetId, React.ReactNode>>;
}

const labelMap = new Map(COMPLETED_RUN_WIDGETS.map((w) => [w.id, w.label]));

function SortableRow({
  id,
  isHidden,
  onToggle,
}: {
  id: ModalWidgetId;
  isHidden: boolean;
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
        isDragging ? "bg-surface-alt z-10 shadow-lg" : "bg-surface"
      } ${isHidden ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        className="touch-none text-muted hover:text-text cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className={`flex-1 text-sm ${isHidden ? "line-through text-muted" : "text-text"}`}>
        {labelMap.get(id) ?? id}
      </span>
      <button
        type="button"
        onClick={onToggle}
        className="text-muted hover:text-text transition-colors"
        aria-label={isHidden ? `Show ${labelMap.get(id)}` : `Hide ${labelMap.get(id)}`}
      >
        {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export function WidgetList({
  order,
  hidden,
  widgetProps,
  renderMap,
  onReorder,
  onToggle,
  sectionHeadings,
}: WidgetListProps) {
  const [editing, setEditing] = useState(false);
  const hiddenSet = new Set(hidden);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = order.indexOf(active.id as ModalWidgetId);
    const newIndex = order.indexOf(over.id as ModalWidgetId);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(arrayMove(order, oldIndex, newIndex));
  };

  if (editing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-sm font-semibold text-muted">Editing layout</span>
          <button
            onClick={() => { setEditing(false); }}
            className="px-3 py-1 text-xs bg-brand hover:bg-brand-hover text-white rounded-lg transition"
          >
            Done
          </button>
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {order.map((id) => (
              <SortableRow
                key={id}
                id={id}
                isHidden={hiddenSet.has(id)}
                onToggle={() => { onToggle(id); }}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    );
  }

  const visibleWidgets = order
    .filter((id) => !hiddenSet.has(id))
    .map((id) => {
      const content = renderMap[id](widgetProps);
      if (content == null) return null;
      const heading = sectionHeadings?.[id];
      return (
        <div key={id}>
          {heading}
          <WidgetCard>
            {content}
          </WidgetCard>
        </div>
      );
    })
    .filter(Boolean);

  return (
    <div className="space-y-2 relative">
      <button
        type="button"
        onClick={() => { setEditing(true); }}
        className="absolute -top-8 right-0 text-muted hover:text-text transition-colors p-1"
        aria-label="Edit widget layout"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      {visibleWidgets}
    </div>
  );
}
