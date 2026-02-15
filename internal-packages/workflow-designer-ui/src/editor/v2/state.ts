export type LeftPanelValue = "run-history" | "secret";
export interface V2LayoutState {
	leftPanel: LeftPanelValue | null;
}
