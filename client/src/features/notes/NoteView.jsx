import { useState } from "react";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Sparkles
} from "lucide-react";
import { generateSummary } from "./notesAPI";
import NoteAIChat from "./NoteAIChat";
import Flashcards from "./Flashcards";
import Quiz from "./Quiz";

const TABS = [
  { id: "summary", label: "Summary" },
  { id: "chat", label: "Chat" },
  { id: "flashcards", label: "Flashcards" },
  { id: "quiz", label: "Quiz" }
];

//Summary tab: generated on demand, kept local to the view
function NoteSummary({ noteId }) {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    setLoading(true);
    setError("");

    try {
      setSummary(await generateSummary(noteId));
    } catch (err) {
      setError(
        err.message ||
          "Unable to generate a summary"
      );
    } finally {
      setLoading(false);
    }
  };

  if (!summary) {
    return (
      <div className="text-center py-14">
        <Sparkles
          size={42}
          className="mx-auto text-gray-400 mb-4"
        />

        <p className="text-gray-600">
          Get a short, revision-ready summary of
          this note.
        </p>

        {error && (
          <p className="text-sm text-red-600 mt-3">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold cursor-pointer transition-colors"
        >
          {loading ? (
            <>
              <Loader2
                size={16}
                className="animate-spin"
              />
              Summarising...
            </>
          ) : (
            "Generate Summary"
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <p className="text-sm leading-7 text-gray-700 whitespace-pre-line">
          {summary}
        </p>
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 disabled:opacity-50 cursor-pointer"
      >
        {loading && (
          <Loader2
            size={14}
            className="animate-spin"
          />
        )}
        Regenerate summary
      </button>

      {error && (
        <p className="text-sm text-red-600">
          {error}
        </p>
      )}

    </div>
  );
}

function NoteView({ note, onBack }) {
  const [activeTab, setActiveTab] =
    useState("summary");

  return (
    <div className="space-y-6">

      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 cursor-pointer"
      >
        <ArrowLeft size={16} />
        Back to notes
      </button>

      {/* Note header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start gap-4">

          <div className="w-11 h-11 shrink-0 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <FileText size={22} />
          </div>

          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">
              {note.title}
            </h1>

            <p className="text-sm text-gray-500 mt-2 line-clamp-2">
              {note.preview}
            </p>

            <p className="text-xs text-gray-400 mt-2">
              {note.characters} characters of
              extracted text
            </p>
          </div>

        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() =>
              setActiveTab(tab.id)
            }
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              activeTab === tab.id
                ? "bg-blue-500 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab. Each is keyed by note id so switching notes
          resets any generated content. */}
      {activeTab === "summary" && (
        <NoteSummary
          key={note._id}
          noteId={note._id}
        />
      )}

      {activeTab === "chat" && (
        <NoteAIChat key={note._id} note={note} />
      )}

      {activeTab === "flashcards" && (
        <Flashcards
          key={note._id}
          noteId={note._id}
        />
      )}

      {activeTab === "quiz" && (
        <Quiz key={note._id} noteId={note._id} />
      )}

    </div>
  );
}

export default NoteView;
