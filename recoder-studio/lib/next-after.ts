export function runAfter(task: () => void | Promise<void>): void {
	setTimeout(() => {
		void Promise.resolve()
			.then(task)
			.catch((error) => {
				console.error("Deferred task failed", error);
			});
	}, 0);
}
