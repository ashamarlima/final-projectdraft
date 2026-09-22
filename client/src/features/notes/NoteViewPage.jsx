import { useCallback, useEffect, useState } from "react";
import {
  useNavigate,
  useParams
} from "react-router-dom";
import { Loader2 } from "lucide-react";
import { getNote } from "./notesAPI";
import NoteView from "./NoteView";

//Route page for /notes/:id
function NoteViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadNote = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setNote(await getNote(id));
    } catch (err) {
      setError(
        err.message || "Unable to load that note"
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    //defer so the effect body performs no synchronous state updates
    const timeoutId = setTimeout(() => {
      loadNote();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadNote]);

  if (loading) {
    return (
      <div className="py-20 text-center text-gray-500">
        <Loader2
          size={28}
          className="mx-auto animate-spin mb-3"
        />

        Loading note...
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center">
        <p className="text-gray-700">
          {error || "Note not found"}
        </p>

        <button
          type="button"
          onClick={() => navigate("/notes")}
          className="mt-5 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold cursor-pointer transition-colors"
        >
          Back to notes
        </button>
      </div>
    );
  }

  return (
    <NoteView
      note={note}
      onBack={() => navigate("/notes")}
    />
  );
}

export default NoteViewPage;
