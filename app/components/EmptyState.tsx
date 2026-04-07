interface EmptyStateProps {
  children: React.ReactNode;
  message: string;
  onClick?: () => void;
}

export function EmptyState({ children, message, onClick }: EmptyStateProps) {
  const content = (
    <p className="text-sm text-muted bg-bg/90 px-4 py-2 rounded-lg">
      {message}
    </p>
  );

  return (
    <div className="relative flex items-center justify-center min-h-[200px]">
      <div className="opacity-[0.07] pointer-events-none select-none w-full">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        {onClick ? (
          <button onClick={onClick} className="hover:scale-105 transition-transform">
            {content}
          </button>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
