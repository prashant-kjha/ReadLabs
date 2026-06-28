import { useState } from "react";
import { BookOpen } from "lucide-react";
import type { LandmarkPaper, LandmarkProgressEntry } from "../../types/landmark";

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "border-border bg-surface-raised text-success",
  intermediate: "border-border bg-surface-raised text-warning",
  advanced: "border-border bg-surface-raised text-danger",
};

interface Props {
  paper: LandmarkPaper;
  role?: string;
  startedAssignmentIds?: Set<string>;
  progressByAssignment?: Map<string, LandmarkProgressEntry>;
  onStart?: (assignmentId: string) => void;
  onAssign?: (paper: LandmarkPaper, difficulty: string) => void;
}

export default function LandmarkPaperCard({ paper, role, startedAssignmentIds, progressByAssignment, onStart, onAssign }: Props) {
  const levels = paper.levels;
  const isTeacher = role === "teacher";
  const defaultDifficulty =
    levels.find((l) => l.difficulty === "intermediate")?.difficulty || levels[0]?.difficulty || "";
  const [selected, setSelected] = useState(defaultDifficulty);
  const selectedLevel = levels.find((l) => l.difficulty === selected) || levels[0];

  // Prefer the rich progress entry (status + section) when the page supplies it;
  // fall back to the boolean "started" set so the card stays usable mid-wiring.
  const entry = selectedLevel ? progressByAssignment?.get(selectedLevel.assignment_id) : undefined;
  const fallbackStarted = Boolean(selectedLevel && startedAssignmentIds?.has(selectedLevel.assignment_id));
  const status: LandmarkProgressEntry["status"] = entry?.status ?? (fallbackStarted ? "in_progress" : "not_started");

  const actionLabel =
    status === "completed" ? "Read again" : status === "in_progress" ? "Continue Reading" : "Start Reading";

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

      {/* Status line for students with progress on the selected level. */}
      {!isTeacher && status !== "not_started" && (
        <p className="font-mono text-[11px] text-[var(--color-text-secondary)] mb-2" data-testid="landmark-card-status">
          {status === "completed"
            ? "Completed"
            : `In progress · section ${(entry?.current_section_index ?? 0) + 1}`}
        </p>
      )}

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
          {actionLabel}
        </button>
      )}
    </div>
  );
}
