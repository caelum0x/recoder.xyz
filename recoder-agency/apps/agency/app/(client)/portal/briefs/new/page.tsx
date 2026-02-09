"use client";

import { useState } from "react";
import { submitBrief } from "./actions";

export default function SubmitBriefPage() {
	const [serviceType, setServiceType] = useState("");
	const [description, setDescription] = useState("");
	const [timeline, setTimeline] = useState("");

	return (
		<div className="max-w-2xl space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-text">Submit a Brief</h1>
				<p className="text-text-muted text-sm mt-1">
					Tell us about your project and we&apos;ll get back to you
				</p>
			</div>

			<form action={submitBrief} className="space-y-4">
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
						onChange={(e) => setServiceType(e.target.value)}
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
						onChange={(e) => setDescription(e.target.value)}
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
						onChange={(e) => setTimeline(e.target.value)}
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
