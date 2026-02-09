"use client";

import { useEffect, useRef } from "react";
import { ChatPanel } from "./chat-panel";

interface FloatingChatProps {
	isOpen: boolean;
	onClose: () => void;
}

export function FloatingChat({ isOpen, onClose }: FloatingChatProps) {
	const chatRef = useRef<HTMLDivElement>(null);

	// Handle click outside to close
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (chatRef.current && !chatRef.current.contains(event.target as Node)) {
				onClose();
			}
		};

		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen, onClose]);

	// Handle escape key
	useEffect(() => {
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		if (isOpen) {
			document.addEventListener("keydown", handleEscape);
		}

		return () => {
			document.removeEventListener("keydown", handleEscape);
		};
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-50 pointer-events-none"
			role="dialog"
			aria-modal="true"
		>
			<div
				ref={chatRef}
				className="absolute bottom-12 right-6 pointer-events-auto animate-fade-in-up"
			>
				<div className="relative">
					{/* Chat Panel */}
					<ChatPanel />
				</div>
			</div>
		</div>
	);
}
