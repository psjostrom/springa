interface ErrorCardProps {
	message: string;
	onRetry: () => void;
}

export function ErrorCard({ message, onRetry }: ErrorCardProps) {
	return (
		<div className="text-center py-4">
			<div className="text-[#ff3366] font-semibold mb-2">Error</div>
			<div className="text-sm text-[#c4b5fd]">{message}</div>
			<button
				onClick={onRetry}
				className="mt-4 px-4 py-2 bg-[#ff2d95] text-white rounded-lg hover:bg-[#e0207a] transition"
			>
				Retry
			</button>
		</div>
	);
}
