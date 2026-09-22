import { useEffect } from "react";
import {
  ExternalLink,
  Loader2,
  X
} from "lucide-react";

//Inline PDF viewer.
//
//The url is a short-lived signed link handed out by the API, which is why
//the iframe can load it directly: the browser fetches the PDF from storage
//rather than through a request we could add a header to.
function PdfViewer({
  material,
  url,
  loading,
  error,
  onClose
}) {
  //Escape closes the viewer, matching the video modal
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () =>
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl h-[90vh] bg-white rounded-xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-200">

          <div className="min-w-0">

            <p className="font-semibold text-gray-900 truncate">
              {material?.title}
            </p>

            <p className="text-xs text-gray-500 mt-1">
              {material?.subject} · Grade{" "}
              {material?.grade} · Lesson{" "}
              {material?.lesson}
            </p>

          </div>


          <div className="flex items-center gap-2 shrink-0">

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
              onClick={onClose}
              className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              aria-label="Close PDF"
            >
              <X size={22} />
            </button>

          </div>

        </div>


        {/* Body */}
        <div className="flex-1 bg-gray-100 min-h-0">

          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">

              <Loader2
                size={28}
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
              title={material?.title || "PDF"}
              className="w-full h-full border-0"
            />
          )}

        </div>

      </div>
    </div>
  );
}

export default PdfViewer;
