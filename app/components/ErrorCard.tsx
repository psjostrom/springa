interface ErrorCardProps {
	message: string;
	onRetry: () => void;
}

export function ErrorCard({ message, onRetry }: ErrorCardProps) {
	return (
		<div className="text-center py-4">
			<div className="text-[#ff3366] font-semibold mb-2">Error</div>
			<div className="text-sm text-[#af9ece]">{message}</div>
			<button
				onClick={onRetry}
				className="mt-4 px-4 py-2 bg-[#f23b94] text-white rounded-lg hover:bg-[#d42f7e] transition"
			>
				Retry
			</button>
		</div>
	);
}
