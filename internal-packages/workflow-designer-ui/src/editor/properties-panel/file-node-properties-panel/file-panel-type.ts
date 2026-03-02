import type { FileNode } from "@recoder/protocol";

export type FileTypeConfig = {
	accept: string[];
	label: string;
	maxSize?: number;
};

export type FilePanelProps = {
	node: FileNode;
	config: FileTypeConfig;
};
