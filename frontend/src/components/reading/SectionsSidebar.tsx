import { Check, SkipForward } from "lucide-react";
import type { Section } from "../../types/sessions";

interface SectionSidebarProps {
  sections: Section[];
  currentSection: number;
  setCurrentSection: (i: number) => void;
  checkpoints: Record<number, { ai_feedback?: string | null; skipped?: boolean }>;
  showSoWhat: boolean;
  showQuiz: boolean;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  previewMode: boolean;
}

interface CheckpointEntry {
  ai_feedback?: string | null;
  skipped?: boolean;
}

const SECTION_TYPE_COLORS: Record<string, string> = {
  Introduction: "bg-primary/10 text-primary",
  Methods: "bg-accent/10 text-accent",
  Results: "bg-success/10 text-success",
  Discussion: "bg-warning/10 text-warning",
  Other: "bg-muted text-[var(--color-text-secondary)]",
};

export default function SectionsSidebar({
  sections,
  currentSection,
  setCurrentSection,
  checkpoints,
  showSoWhat,
  showQuiz,
  collapsed,
  setCollapsed,
  previewMode,
}: SectionSidebarProps) {
  if (collapsed) {
    return (
      <div className="w-11 shrink-0 bg-surface border-r border-border flex flex-col items-center py-3 gap-1">
        <button
          onClick={() => setCollapsed(false)}
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] mb-2"
          title="Expand sections"
          aria-label="Expand sections"
        >
          →
        </button>
        {sections.map((s, i) => {
          const cp = checkpoints[i] || {};
          const done = !!cp.ai_feedback;
          const skipped = !!cp.skipped;
          const active = i === currentSection;
          const locked = !previewMode && i > currentSection && !done;
          return (
            <button
              key={i}
              disabled={locked}
              onClick={() => { if (!locked) { setCollapsed(false); setCurrentSection(i); }}}
              title={s.title}
              className={`w-7 h-7 rounded-sm flex items-center justify-center font-mono text-xs transition-colors ${
                active ? "bg-accent text-[#fdfaf3]" :
                done ? "bg-primary/15 text-primary" :
                skipped ? "bg-muted text-[var(--color-text-secondary)]" :
                locked ? "bg-muted text-[var(--color-text-secondary)] opacity-40" :
                "bg-muted text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              }`}
            >
              {done ? <Check className="w-3 h-3" /> : skipped ? <SkipForward className="w-3 h-3" /> : i + 1}
            </button>
          );
        })}
        {showSoWhat && (
          <button
            onClick={() => { setCollapsed(false); setCurrentSection(sections.length); }}
            title="So What?"
            className={`w-7 h-7 rounded-sm flex items-center justify-center font-mono text-xs ${
              currentSection === sections.length ? "bg-accent text-[#fdfaf3]" : "bg-muted text-[var(--color-text-secondary)]"
            }`}
          >
            ?
          </button>
        )}
        {showQuiz && (
          <button
            onClick={() => { setCollapsed(false); setCurrentSection(sections.length + 1); }}
            title="Quiz"
            className={`w-7 h-7 rounded-sm flex items-center justify-center font-mono text-xs ${
              currentSection === sections.length + 1 ? "bg-accent text-[#fdfaf3]" : "bg-muted text-[var(--color-text-secondary)]"
            }`}
          >
            Q
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-52 shrink-0 bg-surface border-r border-border flex flex-col">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="label-mono">Sections</span>
        <button onClick={() => setCollapsed(true)} aria-label="Collapse sections" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] text-sm">←</button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {sections.map((s, i) => {
          const cp = checkpoints[i] || {};
          const done = !!cp.ai_feedback;
          const skipped = !!cp.skipped;
          const active = i === currentSection;
          const locked = !previewMode && i > currentSection && !done;
          return (
            <button
              key={i}
              disabled={locked}
              onClick={() => !locked && setCurrentSection(i)}
              className={`w-full text-left text-sm pl-3 pr-2 py-1.5 rounded-sm border-l-2 transition-colors flex items-center gap-2 ${
                active ? "border-accent bg-surface-raised text-[var(--color-text)]" :
                locked ? "border-transparent text-[var(--color-text-secondary)] cursor-not-allowed opacity-50" :
                skipped ? "border-transparent text-[var(--color-text-secondary)]" :
                done ? "border-transparent bg-primary/5 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]" :
                "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-muted"
              }`}
            >
              {skipped ? (
                <SkipForward className="w-3 h-3 text-[var(--color-text-secondary)]" />
              ) : done ? (
                <Check className="w-3 h-3 text-primary" />
              ) : (
                <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">{i + 1}</span>
              )}
              <span className="truncate">{s.title}</span>
              {s.section_type && (
                <span className={`font-mono text-[10px] px-1 rounded-sm shrink-0 ${SECTION_TYPE_COLORS[s.section_type] || SECTION_TYPE_COLORS.Other}`}>
                  {s.section_type.slice(0, 1)}
                </span>
              )}
            </button>
          );
        })}
        {showSoWhat && (
          <button
            onClick={() => setCurrentSection(sections.length)}
            className={`w-full text-left text-sm pl-3 pr-2 py-1.5 rounded-sm border-l-2 transition-colors ${
              currentSection === sections.length ? "border-accent bg-surface-raised text-[var(--color-text)]" : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-muted"
            }`}
          >
            So What?
          </button>
        )}
        {showQuiz && (
          <button
            onClick={() => setCurrentSection(sections.length + 1)}
            className={`w-full text-left text-sm pl-3 pr-2 py-1.5 rounded-sm border-l-2 transition-colors ${
              currentSection === sections.length + 1 ? "border-accent bg-surface-raised text-[var(--color-text)]" : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-muted"
            }`}
          >
            Quiz
          </button>
        )}
      </div>
      <StructureCoach sections={sections} checkpoints={checkpoints} />
    </div>
  );
}

function StructureCoach({ sections, checkpoints }: { sections: Section[]; checkpoints: Record<number, CheckpointEntry> }) {
  const typeCounts: Record<string, number> = {};
  const completedCounts: Record<string, number> = {};
  sections.forEach((s, i) => {
    const t = s.section_type || "Other";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
    if (checkpoints[i]?.ai_feedback) completedCounts[t] = (completedCounts[t] || 0) + 1;
  });
  const types = Object.keys(typeCounts);
  if (types.length === 0) return null;
  return (
    <div className="px-3 py-3 border-t border-dotted border-border">
      <p className="label-mono mb-2">Structure Guide</p>
      <div className="space-y-1">
        {types.map((type) => (
          <div key={type} className={`text-xs px-2 py-1 rounded-sm flex items-center justify-between ${SECTION_TYPE_COLORS[type] || SECTION_TYPE_COLORS.Other}`}>
            <span>{type}</span>
            <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">{completedCounts[type] || 0}/{typeCounts[type]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
