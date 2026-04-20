"use client";

import { useEffect, useMemo, useState } from "react";

export function LocalDateTime({
	date,
	format = {
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZoneName: "short",
	},
}: {
	date: Date;
	format?: Intl.DateTimeFormatOptions;
}) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const formattedDate = useMemo(() => {
		if (!mounted) {
			return "";
		}

		return new Intl.DateTimeFormat("en-US", format).format(date);
	}, [date, format, mounted]);

	return <time dateTime={date.toISOString()}>{formattedDate}</time>;
}
