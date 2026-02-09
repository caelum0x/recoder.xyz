export function migratePathname(pathname: string) {
	let newPathname = pathname.split("/").slice(1).join("/");

	// Extract file ID using regex pattern
	const fileIdPattern = /files\/(fl-[A-Za-z0-9]+)/;
	const match = newPathname.match(fileIdPattern);

	// Change filename if file ID is found in the pathname
	if (match?.[1]) {
		const fileId = match[1];
		newPathname = [...newPathname.split("/").slice(0, -1), fileId].join("/");
	}

	return newPathname;
}
