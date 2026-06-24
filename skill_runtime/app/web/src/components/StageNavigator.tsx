const STAGES = [
  "observe-log-review",
  "observe-api-scan",
  "grow-plan",
  "grow-build",
  "grow-quality-review",
  "rehearse-preview",
  "rehearse-iteration",
  "stabilize-release",
] as const;

interface StageNavigatorProps {
  currentStage: string | null;
  onSelect: (stage: string) => void;
  runningStages?: Set<string>;
}

export function StageNavigator({ currentStage, onSelect, runningStages }: StageNavigatorProps) {
  return (
    <aside className="stage-navigator">
      <h3>阶段导航</h3>
      <ul>
        {STAGES.map((stage) => (
          <li
            key={stage}
            className={[
              currentStage === stage ? "active" : "",
              runningStages?.has(stage) ? "running" : "",
            ].join(" ")}
            onClick={() => onSelect(stage)}
          >
            {stage}
          </li>
        ))}
      </ul>
    </aside>
  );
}
