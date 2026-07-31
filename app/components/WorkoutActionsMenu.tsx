import { useEffect, useState } from "react";
import { MoreHorizontal } from "lucide-react";

interface WorkoutActionsMenuProps {
  canReplace: boolean;
  canMove: boolean;
  disabled?: boolean;
  onReplace: () => void;
  onMove: () => void;
  onDelete: () => void;
}

export function WorkoutActionsMenu({
  canReplace,
  canMove,
  disabled = false,
  onReplace,
  onMove,
  onDelete,
}: WorkoutActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const showMenu = open && !disabled;

  useEffect(() => {
    if (!showMenu) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [showMenu]);

  const closeAnd = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Workout actions"
        aria-haspopup="menu"
        aria-expanded={showMenu}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        className="px-2 py-1.5 text-sm bg-surface-alt hover:bg-border text-muted rounded-lg transition disabled:opacity-50"
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
            }}
          />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-50 min-w-[9rem] rounded-lg border border-border bg-surface py-1 shadow-lg shadow-black/40"
          >
            {canReplace && (
              <button
                type="button"
                role="menuitem"
                className="w-full px-3 py-2 text-left text-sm text-muted hover:bg-border hover:text-text transition"
                onClick={() => {
                  closeAnd(onReplace);
                }}
              >
                Replace
              </button>
            )}
            {canMove && (
              <button
                type="button"
                role="menuitem"
                className="w-full px-3 py-2 text-left text-sm text-muted hover:bg-border hover:text-text transition"
                onClick={() => {
                  closeAnd(onMove);
                }}
              >
                Move
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-2 text-left text-sm text-error hover:bg-tint-error transition"
              onClick={() => {
                closeAnd(onDelete);
              }}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
