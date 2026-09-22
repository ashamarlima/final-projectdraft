import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2
} from "lucide-react";
import {
  getMaterialDetail,
  getMaterialViewUrl
} from "./materialsAPI";
import LessonAIChat from "./LessonAIChat";
import MaterialViewerModal from "./MaterialViewerModal";
import Flashcards from "../notes/Flashcards";
import Quiz from "../notes/Quiz";

const TABS = [
  { id: "pdf", label: "Lesson PDF" },
  { id: "chat", label: "Ask AI" },
  { id: "flashcards", label: "Flashcards" },
  { id: "quiz", label: "Quiz" }
];

//The PDF tab: the lesson itself, drawn inline from a short-lived signed
//url, with the option to open it in the full-screen viewer.
function LessonPdf({ material }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  //the full-screen overlay, opened on demand. Rendering it only when asked
  //means the inline viewer stays the default reading experience.
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    //the tab can be closed while the url is still in flight
    let cancelled = false;

    getMaterialViewUrl(material._id)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setUrl(result.url);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }

        setError(
          err.message || "Unable to open that PDF"
        );

        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [material._id]);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-200">

        <p className="text-sm text-gray-500">
          Lesson PDF
        </p>

        <div className="flex items-center gap-2">

          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-sm font-medium hover:bg-blue-100 transition-colors"
            >
              <ExternalLink size={14} />
              New tab
            </a>
          )}

          <button
            type="button"
            onClick={() => setFullScreen(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 cursor-pointer transition-colors"
          >
            <Maximize2 size={14} />
            Full screen
          </button>

        </div>

      </div>


      <div className="h-[70vh] bg-gray-100">

        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">

            <Loader2
              size={26}
              className="animate-spin mb-3"
            />

            Preparing the PDF...

          </div>

        ) : error ? (
          <div className="h-full flex items-center justify-center px-6 text-center">

            <p className="text-sm text-red-600">
              {error}
            </p>

          </div>

        ) : (
          <iframe
            src={url}
            title={material.title || "Lesson PDF"}
            className="w-full h-full border-0"
          />
        )}

      </div>


      {fullScreen && (
        <MaterialViewerModal
          material={material}
          onClose={() => setFullScreen(false)}
        />
      )}

    </div>
  );
}

//The lesson page: one lesson PDF, plus an AI assistant, flashcards and a
//quiz that are all grounded in that lesson's text.
//
//The text is read out of the PDF once at upload and kept on the server, so
//these tabs never send it to the browser: they only show what the AI wrote
//from it. A lesson whose PDF held no readable text says so, rather than
//offering tabs that could not work.
function LessonAIView() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [material, setMaterial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("pdf");

  useEffect(() => {
    //defer so the effect body performs no synchronous state updates
    const timeoutId = setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        setMaterial(await getMaterialDetail(id));
      } catch (err) {
        setError(
          err.message || "Unable to load that lesson"
        );
      } finally {
        setLoading(false);
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [id]);

  if (loading) {
    return (
      <div className="py-20 text-center text-gray-500">
        <Loader2
          size={28}
          className="mx-auto animate-spin mb-3"
        />

        Loading lesson...
      </div>
    );
  }

  if (error || !material) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center">

        <p className="text-gray-700">
          {error || "Lesson not found"}
        </p>

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-5 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold cursor-pointer transition-colors"
        >
          Go back
        </button>

      </div>
    );
  }

  const hasText = Boolean(material.hasText);

  return (
    <div className="space-y-6">

      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 cursor-pointer"
      >
        <ArrowLeft size={16} />
        Back to lessons
      </button>


      {/* Lesson header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">

        <div className="flex items-start gap-4">

          <div className="w-11 h-11 shrink-0 rounded-xl bg-red-50 text-red-500 flex items-center justify-center">
            <FileText size={22} />
          </div>


          <div className="min-w-0">

            <h1 className="text-xl font-bold text-gray-900">
              {material.title}
            </h1>

            <p className="text-sm text-gray-500 mt-2">
              {material.subject} · Grade {material.grade} ·
              Unit {material.unit} · Lesson{" "}
              {material.lesson}
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
            onClick={() => setActiveTab(tab.id)}
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


      {activeTab === "pdf" && (
        <LessonPdf material={material} />
      )}


      {/* The AI tabs share the lesson's text, so a scanned PDF explains
          itself once, above whichever tab is open. */}
      {activeTab !== "pdf" && !hasText && (
        <div className="bg-white border border-amber-200 rounded-2xl p-6 shadow-sm">

          <p className="text-sm text-amber-800">
            This lesson is a scanned or image-only PDF,
            so there is no text for the AI assistant to
            read. The PDF itself still opens on the{" "}
            <button
              type="button"
              onClick={() => setActiveTab("pdf")}
              className="font-semibold underline cursor-pointer"
            >
              Lesson PDF
            </button>{" "}
            tab.
          </p>

        </div>
      )}


      {activeTab === "chat" && hasText && (
        <LessonAIChat
          key={material._id}
          material={material}
        />
      )}

      {activeTab === "flashcards" && hasText && (
        <Flashcards
          key={material._id}
          materialId={material._id}
        />
      )}

      {activeTab === "quiz" && hasText && (
        <Quiz
          key={material._id}
          materialId={material._id}
        />
      )}

    </div>
  );
}

export default LessonAIView;
