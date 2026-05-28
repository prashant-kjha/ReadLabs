import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";
import { Eye, Save, Send } from "lucide-react";

interface GuideSection {
  title: string;
  text?: string;
  guiding_questions: string[];
  key_terms?: string[];
  teacher_notes?: string;
}

interface ReadingGuide {
  sections: GuideSection[];
  difficulty: string;
  generation_error?: string;
  [key: string]: unknown;
}

interface Assignment {
  status: string;
  reading_guide?: ReadingGuide;
  [key: string]: unknown;
}

export default function AssignmentReviewPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [guide, setGuide] = useState<ReadingGuide | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/assignments/${assignmentId}`);
      setAssignment(data);
      if (data.reading_guide?.sections) {
        setGuide(data.reading_guide);
      }
    } catch {
      toast.error("Could not load assignment");
    }
  }, [assignmentId]);

  // Poll while processing
  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (assignment?.status === "processing") load();
    }, 3000);
    return () => clearInterval(interval);
  }, [load, assignment?.status]);

  const updateQuestion = (sectionIdx: number, qIdx: number, value: string) => {
    setGuide((prev) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      sections[sectionIdx] = {
        ...sections[sectionIdx]!,
        guiding_questions: sections[sectionIdx]!.guiding_questions.map((q: string, i: number) =>
          i === qIdx ? value : q
        ),
      };
      return { ...prev, sections };
    });
  };

  const updateTeacherNotes = (sectionIdx: number, value: string) => {
    setGuide((prev) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      sections[sectionIdx] = { ...sections[sectionIdx]!, teacher_notes: value };
      return { ...prev, sections };
    });
  };

  const updateDifficulty = (value: string) => {
    setGuide((prev) => {
      if (!prev) return prev;
      return { ...prev, difficulty: value };
    });
  };

  const handleSave = async (publish = false) => {
    setSaving(true);
    try {
      await api.patch(`/assignments/${assignmentId}`, {
        reading_guide: guide,
        difficulty: guide!.difficulty,
        ...(publish ? { status: "published" } : {}),
      });
      toast.success(publish ? "Assignment published!" : "Changes saved");
      if (publish) navigate("/teacher/classes");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Save failed";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (!assignment) return <div className="p-8 text-[var(--color-text-secondary)]">Loading...</div>;

  if (assignment.status === "processing") {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mb-4" />
        <p className="text-[var(--color-text)] text-lg font-medium">Gemini is analyzing the paper...</p>
        <p className="text-[var(--color-text-secondary)] text-sm mt-1">This takes 10-30 seconds. Don't close this tab.</p>
      </div>
    );
  }

  if (!guide || guide.generation_error) {
    return (
      <div className="p-8">
        <p className="text-red-400">Reading guide generation failed. Please delete and try again.</p>
        {guide?.generation_error && (
          <p className="text-[var(--color-text-secondary)] text-xs mt-1">{guide.generation_error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-heading">Review Reading Guide</h1>
          <p className="section-subheading mt-0.5">
            Edit questions or add teacher notes, then publish.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={guide.difficulty}
            onChange={(e) => updateDifficulty(e.target.value)}
            className="bg-muted text-[var(--color-text)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary border border-border"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          <button
            type="button"
            onClick={() => navigate(`/teacher/assignments/${assignmentId}/preview`)}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            Preview as Student
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="btn-secondary disabled:opacity-50 flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            Save Draft
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="btn-primary disabled:opacity-50 flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            Publish
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {guide.sections.map((section: GuideSection, sIdx: number) => (
          <div key={sIdx} className="card p-5">
            <h2 className="text-[var(--color-text)] font-semibold text-lg mb-1">{section.title}</h2>
            {section.text && (
              <p className="text-[var(--color-text-secondary)] text-xs italic mb-4 line-clamp-2">{section.text}</p>
            )}

            <div className="mb-4">
              <p className="text-[var(--color-text-secondary)] text-xs font-medium uppercase tracking-wide mb-2">
                Guiding Questions
              </p>
              {section.guiding_questions.map((q: string, qIdx: number) => (
                <input
                  key={qIdx}
                  type="text"
                  value={q}
                  onChange={(e) => updateQuestion(sIdx, qIdx, e.target.value)}
                  className="input-field mb-1.5 text-sm"
                />
              ))}
            </div>

            {section.key_terms && section.key_terms.length > 0 && (
              <div className="mb-4">
                <p className="text-[var(--color-text-secondary)] text-xs font-medium uppercase tracking-wide mb-1.5">
                  Key Terms
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {section.key_terms.map((term: string, tIdx: number) => (
                    <span
                      key={tIdx}
                      className="badge bg-muted text-[var(--color-text)] text-xs"
                    >
                      {term}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-[var(--color-text-secondary)] text-xs font-medium uppercase tracking-wide mb-1.5">
                Teacher Notes (optional — visible to students)
              </p>
              <textarea
                value={section.teacher_notes || ""}
                onChange={(e) => updateTeacherNotes(sIdx, e.target.value)}
                placeholder="Add a note for students about this section..."
                rows={2}
                className="input-field text-sm resize-none placeholder:text-[var(--color-text-secondary)]"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
