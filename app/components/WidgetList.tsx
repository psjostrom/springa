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
        isDragging ? "bg-[#3d2b5a] z-10 shadow-lg" : "bg-[#1e1535]"
      } ${isHidden ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        className="touch-none text-[#b8a5d4] hover:text-white cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className={`flex-1 text-sm ${isHidden ? "line-through text-[#b8a5d4]" : "text-white"}`}>
        {labelMap.get(id) ?? id}
      </span>
      <button
        type="button"
        onClick={onToggle}
        className="text-[#b8a5d4] hover:text-white transition-colors"
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
          <span className="text-sm font-semibold text-[#c4b5fd]">Editing layout</span>
          <button
            onClick={() => { setEditing(false); }}
            className="px-3 py-1 text-xs bg-[#ff2d95] hover:bg-[#e0207a] text-white rounded-lg transition"
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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => { setEditing(true); }}
          className="text-[#b8a5d4] hover:text-white transition-colors p-1"
          aria-label="Edit widget layout"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
      {order
        .filter((id) => !hiddenSet.has(id))
        .map((id) => {
          const content = renderMap[id](widgetProps);
          if (content == null) return null;
          return (
            <WidgetCard key={id}>
              {content}
            </WidgetCard>
          );
        })}
    </div>
  );
}
