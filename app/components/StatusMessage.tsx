interface StatusMessageProps {
	message: string;
}

export function StatusMessage({ message }: StatusMessageProps) {
	if (!message) return null;

	return (
		<div
			className={`p-4 rounded-lg text-sm font-medium ${
				message.includes("Error")
					? "bg-red-50 text-red-700"
					: "bg-green-50 text-green-700"
			}`}
		>
			{message}
		</div>
	);
}
