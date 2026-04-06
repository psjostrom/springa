interface EmptyStateProps {
  children: React.ReactNode;
  message: string;
}

export function EmptyState({ children, message }: EmptyStateProps) {
  return (
    <div className="relative flex items-center justify-center min-h-[200px]">
      <div className="opacity-[0.07] pointer-events-none select-none w-full">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="text-sm text-muted bg-bg/90 px-4 py-2 rounded-lg">
          {message}
        </p>
      </div>
    </div>
  );
}
