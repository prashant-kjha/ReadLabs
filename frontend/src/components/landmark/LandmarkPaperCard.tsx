import { useState } from "react";
import { BookOpen } from "lucide-react";
import type { LandmarkPaper } from "../../types/landmark";

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "border-border bg-surface-raised text-success",
  intermediate: "border-border bg-surface-raised text-warning",
  advanced: "border-border bg-surface-raised text-danger",
};

interface Props {
  paper: LandmarkPaper;
  role?: string;
  startedAssignmentIds?: Set<string>;
  onStart?: (assignmentId: string) => void;
  onAssign?: (paper: LandmarkPaper, difficulty: string) => void;
}

export default function LandmarkPaperCard({ paper, role, startedAssignmentIds, onStart, onAssign }: Props) {
  const levels = paper.levels;
  const isTeacher = role === "teacher";
  const defaultDifficulty =
    levels.find((l) => l.difficulty === "intermediate")?.difficulty || levels[0]?.difficulty || "";
  const [selected, setSelected] = useState(defaultDifficulty);
  const selectedLevel = levels.find((l) => l.difficulty === selected) || levels[0];
  const started = selectedLevel ? startedAssignmentIds?.has(selectedLevel.assignment_id) : false;

  return (
    <div className="card-hover p-4 flex flex-col" data-testid="landmark-card">
      <div className="flex items-start gap-2 mb-2">
        <BookOpen className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <h3 className="font-display text-sm font-semibold leading-snug text-[var(--color-text)]">{paper.title}</h3>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {levels.map((l) => (
          <button
            key={l.difficulty}
            type="button"
            onClick={() => setSelected(l.difficulty)}
            aria-pressed={selected === l.difficulty}
            className={`font-mono uppercase tracking-wider text-xs px-2 py-1 rounded-sm border transition-colors ${
              selected === l.difficulty
                ? "bg-primary text-[var(--color-primary-foreground)] border-primary"
                : DIFFICULTY_COLORS[l.difficulty] || "bg-muted text-[var(--color-text-secondary)]"
            }`}
          >
            {l.difficulty}
          </button>
        ))}
      </div>
      {isTeacher ? (
        <button
          type="button"
          onClick={() => selectedLevel && onAssign?.(paper, selectedLevel.difficulty)}
          disabled={!selectedLevel}
          className="btn-primary w-full mt-auto text-sm disabled:opacity-50"
        >
          Assign to class
        </button>
      ) : (
        <button
          type="button"
          onClick={() => selectedLevel && onStart?.(selectedLevel.assignment_id)}
          disabled={!selectedLevel}
          className="btn-primary w-full mt-auto text-sm disabled:opacity-50"
        >
          {started ? "Continue Reading" : "Start Reading"}
        </button>
      )}
    </div>
  );
}
