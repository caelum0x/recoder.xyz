"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { submitBrief } from "./actions";

const DRAFT_KEY = "agency-brief-draft";
const DEBOUNCE_MS = 500;

interface BriefDraft {
	serviceType: string;
	description: string;
	timeline: string;
}

export default function SubmitBriefPage() {
	const [serviceType, setServiceType] = useState("");
	const [description, setDescription] = useState("");
	const [timeline, setTimeline] = useState("");
	const [resumedFromDraft, setResumedFromDraft] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Restore draft on mount
	useEffect(() => {
		try {
			const saved = localStorage.getItem(DRAFT_KEY);
			if (saved) {
				const draft: BriefDraft = JSON.parse(saved);
				if (draft.serviceType || draft.description || draft.timeline) {
					setServiceType(draft.serviceType ?? "");
					setDescription(draft.description ?? "");
					setTimeline(draft.timeline ?? "");
					setResumedFromDraft(true);
				}
			}
		} catch {
			// Ignore corrupt localStorage data
		}
	}, []);

	// Debounced save to localStorage
	const saveDraft = useCallback(
		(data: BriefDraft) => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
			debounceRef.current = setTimeout(() => {
				try {
					localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
				} catch {
					// Storage full or unavailable
				}
			}, DEBOUNCE_MS);
		},
		[],
	);

	const handleServiceTypeChange = (value: string) => {
		setServiceType(value);
		saveDraft({ serviceType: value, description, timeline });
	};

	const handleDescriptionChange = (value: string) => {
		setDescription(value);
		saveDraft({ serviceType, description: value, timeline });
	};

	const handleTimelineChange = (value: string) => {
		setTimeline(value);
		saveDraft({ serviceType, description, timeline: value });
	};

	const handleSubmit = async (formData: FormData) => {
		// Clear draft before submitting (server action will redirect)
		try {
			localStorage.removeItem(DRAFT_KEY);
		} catch {
			// Ignore
		}
		await submitBrief(formData);
	};

	return (
		<div className="max-w-2xl space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-text">Submit a Brief</h1>
				<p className="text-text-muted text-sm mt-1">
					Tell us about your project and we&apos;ll get back to you
				</p>
			</div>

			{resumedFromDraft && (
				<div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2 text-sm text-blue-700">
					<svg
						className="size-4 shrink-0"
						fill="none"
						viewBox="0 0 24 24"
						strokeWidth={1.5}
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
						/>
					</svg>
					Resumed from draft
					<button
						type="button"
						onClick={() => {
							setResumedFromDraft(false);
							setServiceType("");
							setDescription("");
							setTimeline("");
							try {
								localStorage.removeItem(DRAFT_KEY);
							} catch {
								// Ignore
							}
						}}
						className="ml-auto text-xs text-blue-600 hover:text-blue-800 underline"
					>
						Discard draft
					</button>
				</div>
			)}

			<form action={handleSubmit} className="space-y-4">
				<div>
					<label
						htmlFor="serviceType"
						className="block text-sm font-medium text-text mb-1"
					>
						Service Type
					</label>
					<select
						id="serviceType"
						name="serviceType"
						value={serviceType}
						onChange={(e) => handleServiceTypeChange(e.target.value)}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
					>
						<option value="">Select a service...</option>
						<option value="landing_page">Landing Page</option>
						<option value="blog_post">Blog Post</option>
						<option value="seo_analysis">SEO Analysis</option>
						<option value="email_sequence">Email Sequence</option>
						<option value="other">Other</option>
					</select>
				</div>

				<div>
					<label
						htmlFor="description"
						className="block text-sm font-medium text-text mb-1"
					>
						Description *
					</label>
					<textarea
						id="description"
						name="description"
						value={description}
						onChange={(e) => handleDescriptionChange(e.target.value)}
						required
						rows={6}
						placeholder="Describe what you need..."
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted resize-none"
					/>
				</div>

				<div>
					<label
						htmlFor="timeline"
						className="block text-sm font-medium text-text mb-1"
					>
						Timeline
					</label>
					<input
						id="timeline"
						name="timeline"
						type="text"
						value={timeline}
						onChange={(e) => handleTimelineChange(e.target.value)}
						placeholder="e.g., 2 weeks, end of month"
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted"
					/>
				</div>

				<button
					type="submit"
					className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
				>
					Submit Brief
				</button>
			</form>
		</div>
	);
}
