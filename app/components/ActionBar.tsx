import { UploadCloud } from "lucide-react";

interface ActionBarProps {
	workoutCount: number;
	isUploading: boolean;
	onUpload: () => void;
}

export function ActionBar({
	workoutCount,
	isUploading,
	onUpload,
}: ActionBarProps) {
	return (
		<div className="fixed bottom-4 left-4 right-4 md:static z-50 flex items-center justify-between bg-blue-50 p-4 rounded-lg border border-blue-100 shadow-xl md:shadow-sm backdrop-blur-sm bg-opacity-95 md:bg-opacity-100">
			<div>
				<h3 className="font-bold text-blue-900 text-sm md:text-base">
					Ready to sync?
				</h3>
				<p className="text-xs md:text-sm text-blue-700">
					{workoutCount} workouts generated.
				</p>
			</div>
			<button
				onClick={onUpload}
				disabled={isUploading}
				className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 md:px-6 md:py-2 rounded-md font-bold hover:bg-blue-700 disabled:opacity-50 transition shadow-sm text-sm md:text-base"
			>
				{isUploading ? (
					"Syncing..."
				) : (
					<>
						<UploadCloud size={18} /> Sync
					</>
				)}
			</button>
		</div>
	);
}
