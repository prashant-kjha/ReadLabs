import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";

const CATEGORIES = ["All", "Biology", "Computer Science", "Medicine", "Physics", "Chemistry", "Mathematics", "Engineering", "Psychology", "Economics"];

const DIFFICULTY_COLORS = {
  beginner: "bg-green-500/20 text-green-300",
  intermediate: "bg-yellow-500/20 text-yellow-300",
  advanced: "bg-red-500/20 text-red-300",
};

export default function SelfStudyPage() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [papers, setPapers] = useState([]);
  const [categories, setCategories] = useState(CATEGORIES);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [fetching, setFetching] = useState(null);

  useEffect(() => {
    loadPapers();
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory]);

  const loadPapers = async () => {
    try {
      const params = activeCategory !== "All" ? `?category=${activeCategory}` : "";
      const { data } = await api.get(`/library/browse${params}`);
      setPapers(data);
    } catch {}
  };

  const loadCategories = async () => {
    try {
      const { data } = await api.get("/library/categories");
      if (data.length > 0) setCategories(["All", ...data]);
    } catch {}
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const { data } = await api.get(`/library/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchResults(data);
    } catch {
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("title", file.name.replace(".pdf", "").replace(/_/g, " "));
    form.append("category", activeCategory !== "All" ? activeCategory : "");
    try {
      const { data } = await api.post("/library/upload", form);
      toast.success("Paper uploaded! Generating reading guide...");
      pollAndNavigate(data.assignment_id);
    } catch (err) {
      toast.error(err.message || "Upload failed");
      setUploading(false);
    }
    e.target.value = "";
  };

  const handleFetchCore = async (coreId, title) => {
    setFetching(coreId);
    try {
      const { data } = await api.post("/library/fetch", { core_id: coreId, title });
      toast.success("Fetching paper... Generating reading guide...");
      pollAndNavigate(data.assignment_id);
    } catch (err) {
      toast.error(err.message || "Could not fetch paper");
      setFetching(null);
    }
  };

  const pollAndNavigate = async (assignmentId) => {
    let attempts = 0;
    const poll = async () => {
      try {
        const { data } = await api.get(`/library/status/${assignmentId}`);
        if (data.status === "published" || data.status === "draft") {
          setUploading(false);
          setFetching(null);
          await api.post(`/sessions/`, { assignment_id: assignmentId });
          navigate(`/student/read/${assignmentId}`);
          return;
        }
      } catch {}
      attempts++;
      if (attempts < 30) {
        setTimeout(poll, 2000);
      } else {
        toast.error("Guide generation is taking too long. Check back later.");
        setUploading(false);
        setFetching(null);
      }
    };
    poll();
  };

  const handleStartReading = async (assignment) => {
    if (!assignment) {
      toast.error("Reading guide not ready yet");
      return;
    }
    try {
      await api.post(`/sessions/`, { assignment_id: assignment.id });
      navigate(`/student/read/${assignment.id}`);
    } catch {
      toast.error("Could not start reading");
    }
  };

  const displayPapers = searchResults !== null ? searchResults.map((r) => ({ ...r, fromSearch: true })) : papers;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Paper Library</h1>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
        >
          {uploading ? "Processing..." : "Upload PDF"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search open-access papers..."
          className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
        />
        <button
          type="submit"
          disabled={searching || !searchQuery.trim()}
          className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {searching ? "Searching..." : "Search"}
        </button>
        {searchResults !== null && (
          <button
            type="button"
            onClick={() => { setSearchResults(null); setSearchQuery(""); }}
            className="text-gray-400 hover:text-white text-sm px-3"
          >
            Clear
          </button>
        )}
      </form>

      {/* Category tabs */}
      {!searchResults && (
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`whitespace-nowrap text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {displayPapers.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {searchResults !== null ? "No papers found. Try a different search." : "No papers in the library yet. Upload one or search above."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {displayPapers.map((paper) => (
            <div key={paper.id || paper.core_id} className="bg-gray-900 rounded-xl p-4 hover:bg-gray-800 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-white font-medium text-sm leading-tight flex-1">{paper.title}</h3>
                {paper.category && (
                  <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded ml-2 shrink-0">{paper.category}</span>
                )}
              </div>
              {paper.authors && <p className="text-gray-500 text-xs mb-1">{paper.authors}</p>}
              {paper.year_published && <p className="text-gray-600 text-xs mb-2">{paper.year_published}</p>}

              {paper.fromSearch ? (
                /* CORE search result */
                <button
                  onClick={() => handleFetchCore(paper.core_id, paper.title)}
                  disabled={fetching === paper.core_id}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
                >
                  {fetching === paper.core_id ? "Fetching..." : "Add to Library & Read"}
                </button>
              ) : paper.assignment ? (
                /* Already in library */
                <div>
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${DIFFICULTY_COLORS[paper.assignment.difficulty] || "bg-gray-700 text-gray-400"}`}>
                    {paper.assignment.difficulty || "—"}
                  </span>
                  <button
                    onClick={() => handleStartReading(paper.assignment)}
                    className="mt-2 w-full bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 rounded-lg font-medium transition-colors"
                  >
                    {paper.assignment.status === "published" ? "Start Reading" : "Processing..."}
                  </button>
                </div>
              ) : (
                <p className="text-gray-600 text-xs">No reading guide yet.</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload processing overlay */}
      {uploading && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-8 text-center">
            <div className="animate-spin w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-white font-medium">Generating reading guide...</p>
            <p className="text-gray-400 text-sm mt-1">This takes 10-30 seconds.</p>
          </div>
        </div>
      )}
    </div>
  );
}
