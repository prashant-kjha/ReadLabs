import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";

export default function AssignmentReviewPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState(null);
  const [guide, setGuide] = useState(null);
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

  const updateQuestion = (sectionIdx, qIdx, value) => {
    setGuide((prev) => {
      const sections = [...prev.sections];
      sections[sectionIdx] = {
        ...sections[sectionIdx],
        guiding_questions: sections[sectionIdx].guiding_questions.map((q, i) =>
          i === qIdx ? value : q
        ),
      };
      return { ...prev, sections };
    });
  };

  const updateTeacherNotes = (sectionIdx, value) => {
    setGuide((prev) => {
      const sections = [...prev.sections];
      sections[sectionIdx] = { ...sections[sectionIdx], teacher_notes: value };
      return { ...prev, sections };
    });
  };

  const updateDifficulty = (value) => {
    setGuide((prev) => ({ ...prev, difficulty: value }));
  };

  const handleSave = async (publish = false) => {
    setSaving(true);
    try {
      await api.patch(`/assignments/${assignmentId}`, {
        reading_guide: guide,
        difficulty: guide.difficulty,
        ...(publish ? { status: "published" } : {}),
      });
      toast.success(publish ? "Assignment published!" : "Changes saved");
      if (publish) navigate("/teacher/classes");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!assignment) return <div className="p-8 text-gray-400">Loading…</div>;

  if (assignment.status === "processing") {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full mb-4" />
        <p className="text-white text-lg font-medium">Gemini is analyzing the paper…</p>
        <p className="text-gray-400 text-sm mt-1">This takes 10–30 seconds. Don't close this tab.</p>
      </div>
    );
  }

  if (!guide || guide.generation_error) {
    return (
      <div className="p-8">
        <p className="text-red-400">Reading guide generation failed. Please delete and try again.</p>
        {guide?.generation_error && (
          <p className="text-gray-500 text-xs mt-1">{guide.generation_error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Review Reading Guide</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Edit questions or add teacher notes, then publish.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={guide.difficulty}
            onChange={(e) => updateDifficulty(e.target.value)}
            className="bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            Publish
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {guide.sections.map((section, sIdx) => (
          <div key={sIdx} className="bg-gray-900 rounded-xl p-5">
            <h2 className="text-white font-semibold text-lg mb-1">{section.title}</h2>
            {section.text && (
              <p className="text-gray-500 text-xs italic mb-4 line-clamp-2">{section.text}</p>
            )}

            <div className="mb-4">
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">
                Guiding Questions
              </p>
              {section.guiding_questions.map((q, qIdx) => (
                <input
                  key={qIdx}
                  type="text"
                  value={q}
                  onChange={(e) => updateQuestion(sIdx, qIdx, e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm mb-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ))}
            </div>

            {section.key_terms?.length > 0 && (
              <div className="mb-4">
                <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-1.5">
                  Key Terms
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {section.key_terms.map((term, tIdx) => (
                    <span
                      key={tIdx}
                      className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded"
                    >
                      {term}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-1.5">
                Teacher Notes (optional — visible to students)
              </p>
              <textarea
                value={section.teacher_notes || ""}
                onChange={(e) => updateTeacherNotes(sIdx, e.target.value)}
                placeholder="Add a note for students about this section…"
                rows={2}
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
