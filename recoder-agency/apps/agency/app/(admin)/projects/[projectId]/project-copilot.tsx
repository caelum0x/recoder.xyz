"use client";

import { SparklesIcon, SendIcon, XIcon, MessageSquareIcon } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
}

export function ProjectCopilot({ projectId }: { projectId: string }) {
	const [isOpen, setIsOpen] = useState(false);
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	const sendMessage = useCallback(
		async (text: string) => {
			if (!text.trim() || isLoading) return;

			const userMsg: Message = {
				id: crypto.randomUUID(),
				role: "user",
				content: text.trim(),
			};
			setMessages((prev) => [...prev, userMsg]);
			setInput("");
			setIsLoading(true);

			try {
				const res = await fetch("/api/agency/project-chat", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						projectId,
						messages: [...messages, userMsg].map((m) => ({
							role: m.role,
							content: m.content,
						})),
					}),
				});

				if (!res.ok) throw new Error("Failed");

				const reader = res.body?.getReader();
				if (!reader) throw new Error("No stream");

				const assistantId = crypto.randomUUID();
				setMessages((prev) => [
					...prev,
					{ id: assistantId, role: "assistant", content: "" },
				]);

				const decoder = new TextDecoder();
				let fullContent = "";

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value, { stream: true });
					// Parse SSE data lines
					for (const line of chunk.split("\n")) {
						if (line.startsWith("data: ")) {
							const data = line.slice(6);
							if (data === "[DONE]") continue;
							try {
								const parsed = JSON.parse(data);
								const delta =
									parsed.choices?.[0]?.delta?.content || "";
								fullContent += delta;
								setMessages((prev) =>
									prev.map((m) =>
										m.id === assistantId
											? { ...m, content: fullContent }
											: m,
									),
								);
							} catch {}
						}
					}
				}
			} catch {
				setMessages((prev) => [
					...prev,
					{
						id: crypto.randomUUID(),
						role: "assistant",
						content: "Sorry, something went wrong. Try again.",
					},
				]);
			} finally {
				setIsLoading(false);
			}
		},
		[projectId, messages, isLoading],
	);

	if (!isOpen) {
		return (
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3 text-sm font-medium text-white shadow-lg hover:from-purple-700 hover:to-blue-700 transition-all hover:scale-105"
			>
				<SparklesIcon className="size-4" />
				Project Co-pilot
			</button>
		);
	}

	return (
		<div
			className="fixed bottom-6 right-6 z-50 flex w-96 flex-col rounded-2xl border border-border bg-background shadow-2xl"
			style={{ maxHeight: "70vh" }}
		>
			<div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3">
				<div className="flex items-center gap-2 text-white">
					<SparklesIcon className="size-4" />
					<span className="text-sm font-semibold">Project Co-pilot</span>
				</div>
				<button
					type="button"
					onClick={() => setIsOpen(false)}
					className="text-white/70 hover:text-white transition-colors"
				>
					<XIcon className="size-4" />
				</button>
			</div>

			<div
				className="flex-1 overflow-y-auto p-4 space-y-3"
				style={{ minHeight: "200px", maxHeight: "50vh" }}
			>
				{messages.length === 0 && (
					<div className="text-center py-8 text-muted-foreground">
						<MessageSquareIcon className="size-8 mx-auto mb-2 opacity-30" />
						<p className="text-sm">Ask about this project</p>
						<div className="mt-3 space-y-1 text-xs">
							{[
								"What's the project status and next steps?",
								"Which deliverables need attention?",
								"Estimate remaining timeline",
							].map((q) => (
								<button
									key={q}
									type="button"
									onClick={() => sendMessage(q)}
									className="block w-full rounded-lg border border-border px-3 py-1.5 text-left hover:bg-accent transition-colors"
								>
									{q}
								</button>
							))}
						</div>
					</div>
				)}
				{messages.map((m) => (
					<div
						key={m.id}
						className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
					>
						<div
							className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
								m.role === "user"
									? "bg-primary text-primary-foreground"
									: "bg-muted text-foreground"
							}`}
						>
							<div className="whitespace-pre-wrap">{m.content}</div>
						</div>
					</div>
				))}
				{isLoading && messages[messages.length - 1]?.content === "" && (
					<div className="flex justify-start">
						<div className="bg-muted rounded-xl px-3 py-2">
							<div className="flex items-center gap-2">
								<div className="size-1.5 rounded-full bg-purple-500 animate-pulse" />
								<div className="size-1.5 rounded-full bg-blue-500 animate-pulse [animation-delay:0.2s]" />
								<div className="size-1.5 rounded-full bg-purple-500 animate-pulse [animation-delay:0.4s]" />
							</div>
						</div>
					</div>
				)}
				<div ref={messagesEndRef} />
			</div>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					sendMessage(input);
				}}
				className="border-t border-border p-3"
			>
				<div className="flex gap-2">
					<input
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder="Ask about this project..."
						className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500/30"
						disabled={isLoading}
					/>
					<button
						type="submit"
						disabled={isLoading || !input.trim()}
						className="rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-2 text-white disabled:opacity-50 hover:from-purple-700 hover:to-blue-700 transition-all"
					>
						<SendIcon className="size-4" />
					</button>
				</div>
			</form>
		</div>
	);
}
