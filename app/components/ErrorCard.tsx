interface ErrorCardProps {
	message: string;
	onRetry: () => void;
}

export function ErrorCard({ message, onRetry }: ErrorCardProps) {
	return (
		<div className="text-center py-4">
			<div className="text-error font-semibold mb-2">Error</div>
			<div className="text-sm text-muted">{message}</div>
			<button
				onClick={onRetry}
				className="mt-4 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover transition"
			>
				Retry
			</button>
		</div>
	);
}
