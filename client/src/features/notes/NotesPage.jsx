import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Loader2,
  RefreshCw,
  Upload
} from "lucide-react";
import { getNotes, uploadNote, deleteNote  } from "./notesAPI";
import { readFormValues } from "../../shared/form/readFormValues";

//Route page for /notes
function NotesPage() {
  const navigate = useNavigate();

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const fileInputRef = useRef(null);

  //the upload form is uncontrolled: the title is read when it is
  //submitted, so typing it does not re-render the notes list below
  const formRef = useRef(null);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setNotes(await getNotes());
    } catch (err) {
      setError(
        err.message || "Unable to load your notes"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    //defer the initial load so the effect body performs no
    //synchronous state updates (loadNotes calls setLoading)
    const timeoutId = setTimeout(() => {
      loadNotes();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadNotes]);

  const handleUpload = async (e) => {
    e.preventDefault();

    const file = fileInputRef.current?.files?.[0];

    if (!file) {
      setError(
        "Please choose a PDF, image or text file to upload"
      );

      return;
    }

    setUploading(true);
    setError("");

    try {
      const { title } = readFormValues(formRef.current);

      const note = await uploadNote(file, title || "");

      //newest first, matching the server ordering
      setNotes((current) => [note, ...current]);

      //clears both the title and the chosen file
      formRef.current?.reset();

    } catch (err) {
      setError(
        err.message || "Unable to upload that file"
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Study Notes
        </h1>

        <p className="text-sm text-gray-500 mt-1">
          Upload your notes, then summarise them,
          ask questions, and revise with flashcards
          and quizzes.
        </p>
      </div>

      {/* Upload */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">

        <h2 className="text-lg font-bold text-gray-900">
          Upload a note
        </h2>

        <p className="text-sm text-gray-500 mt-1">
          PDF, a photo of your notes, or plain text, up
to 10MB. Images are read by the AI assistant, so
upload one you can read clearly.
        </p>

        <form
          ref={formRef}
          onSubmit={handleUpload}
          className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <input
            name="title"
            type="text"
            defaultValue=""
            placeholder="Note title (optional)"
            className="px-4 py-2.5 bg-white border border-gray-300 text-gray-800 placeholder-gray-400 rounded-xl focus:border-blue-500 outline-none"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf,text/plain,.txt,image/*,.png,.jpg,.jpeg,.webp,.avif,.heic,.heif,.gif,.tif,.tiff,.bmp"
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-xl file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-600 file:text-sm file:font-medium cursor-pointer"
          />

          <button
            type="submit"
            disabled={uploading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold cursor-pointer transition-colors"
          >
            {uploading ? (
              <>
                <Loader2
                  size={16}
                  className="animate-spin"
                />
                Uploading...
              </>
            ) : (
              <>
                <Upload size={16} />
                Upload
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

      </div>

      {/* Notes list */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">

          <h2 className="text-lg font-bold text-gray-900">
            My notes
          </h2>

          <button
            type="button"
            onClick={loadNotes}
            disabled={loading}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} />
            Refresh
          </button>

        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-500">
            <Loader2
              size={26}
              className="mx-auto animate-spin mb-3"
            />

            Loading your notes...
          </div>

        ) : notes.length === 0 ? (
          <div className="py-16 text-center">

            <FileText
              size={46}
              className="mx-auto text-gray-300 mb-4"
            />

            <p className="text-gray-500">
              No notes yet. Upload one to get started!
            
            </p>

          </div>

        ) : (
          <ul className="divide-y divide-gray-100">
            {notes.map((note) => (
              <li
                key={note._id}
                className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
              >
                <div className="min-w-0">

                  <p className="font-medium text-gray-900 truncate">
                    {note.title}
                  </p>

                  <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                    {note.preview}
                  </p>

                  <p className="text-xs text-gray-400 mt-1">
                    {note.characters} characters
                    {" · "}
                    {new Date(
                      note.createdAt
                    ).toLocaleDateString()}
                  </p>

                </div>

                <button
                  type="button"
                  onClick={() =>
                    navigate(`/notes/${note._id}`)
                  }
                  className="shrink-0 px-4 py-2 rounded-xl bg-blue-50 text-blue-600 text-sm font-semibold hover:bg-blue-100 cursor-pointer transition-colors item-center gap-2 flex ml-auto"
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (window.confirm('Are you sure you want to delete this note?')) {
                      await deleteNote(note._id);
                      await loadNotes();
                    }
                  }}
                  className="shrink-0 px-4 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 cursor-pointer transition-colors"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}

      </div>

    </div>
  );
}

export default NotesPage;
