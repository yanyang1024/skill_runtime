interface StageNavigatorProps {
    currentStage: string | null;
    onSelect: (stage: string) => void;
    runningStages?: Set<string>;
}
export declare function StageNavigator({ currentStage, onSelect, runningStages }: StageNavigatorProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=StageNavigator.d.ts.map