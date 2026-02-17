interface StatusMessageProps {
	message: string;
}

export function StatusMessage({ message }: StatusMessageProps) {
	if (!message) return null;

	return (
		<div
			className={`p-4 rounded-lg text-sm font-medium border ${
				message.includes("Error")
					? "bg-[#3d1525] text-[#ff6b8a] border-[#ff3366]/30"
					: "bg-[#1a3d25] text-[#39ff14] border-[#39ff14]/30"
			}`}
		>
			{message}
		</div>
	);
}
