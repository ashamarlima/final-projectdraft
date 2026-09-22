import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  RefreshCw,
  RotateCw
} from "lucide-react";
import { generateFlashcards } from "./notesAPI";
import { getMaterialFlashcards } from "../materials/materialsAPI";

//Flashcards can be built from one of the student's own notes or from a
//lesson PDF. The only difference is which endpoint supplies the cards, so
//whichever id is given decides that.
function Flashcards({ noteId, materialId }) {
  const label = materialId ? "lesson" : "note";

  const [cards, setCards] = useState([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    setLoading(true);
    setError("");

    try {
      const generated = materialId
        ? await getMaterialFlashcards(materialId)
        : await generateFlashcards(noteId);

      setCards(generated);
      setIndex(0);
      setFlipped(false);

    } catch (err) {
      setError(
        err.message ||
          "Unable to generate flashcards"
      );
    } finally {
      setLoading(false);
    }
  };

  const move = (step) => {
    setFlipped(false);

    setIndex((current) => {
      const next = current + step;

      if (next < 0) {
        return cards.length - 1;
      }

      if (next >= cards.length) {
        return 0;
      }

      return next;
    });
  };

  if (cards.length === 0) {
    return (
      <div className="text-center py-14">
        <Layers
          size={42}
          className="mx-auto text-gray-400 mb-4"
        />

        <p className="text-gray-600">
          Turn this {label} into flip cards for
          revision.
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
              Building flashcards...
            </>
          ) : (
            "Generate Flashcards"
          )}
        </button>
      </div>
    );
  }

  const card = cards[index];

  return (
    <div className="space-y-5">

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Card {index + 1} of {cards.length}
        </p>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw size={14} />
          Regenerate
        </button>
      </div>

      {/* Flip card */}
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="w-full min-h-56 bg-white border border-gray-200 rounded-2xl shadow-sm p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-blue-300 transition-colors"
      >
        <span className="text-xs uppercase tracking-wide text-gray-400 mb-4">
          {flipped ? "Answer" : "Question"}
        </span>

        <span className="text-lg font-medium text-gray-800">
          {flipped ? card.answer : card.question}
        </span>

        <span className="mt-6 inline-flex items-center gap-2 text-xs text-blue-500">
          <RotateCw size={13} />
          Click to flip
        </span>
      </button>

      {error && (
        <p className="text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => move(-1)}
          className="inline-flex items-center gap-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 cursor-pointer"
        >
          <ChevronLeft size={16} />
          Previous
        </button>

        <button
          type="button"
          onClick={() => move(1)}
          className="inline-flex items-center gap-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 cursor-pointer"
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>

    </div>
  );
}

export default Flashcards;
