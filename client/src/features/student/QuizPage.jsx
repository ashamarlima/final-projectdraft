import {
    useCallback,
    useEffect,
    useState
} from "react";

import {
    useNavigate
} from "react-router-dom";

import {
    ArrowLeft,
    ClipboardList,
    FileText,
    Loader2,
    RefreshCw,
    Sparkles,
    Trophy
} from "lucide-react";

import Quiz from "../notes/Quiz";

import {
    getNotes
} from "../notes/notesAPI";

import {
    getQuizAttempts
} from "../quizzes/quizzesAPI";

//Route page for /quizzes.
//
//A quiz is written by the AI from the text of one of the student's own
//notes, and the server grades the answers, so this page picks the note
//and shows the results that came back. The note list is the same one the
//Study Notes page shows, which is why there is no separate source of
//truth for quizzes.
function QuizPage() {
    const navigate = useNavigate();

    const [notes, setNotes] = useState([]);
    const [attempts, setAttempts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    //the note whose quiz is open, if any
    const [activeNote, setActiveNote] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const [noteList, attemptList] =
                await Promise.all([
                    getNotes(),
                    getQuizAttempts()
                ]);

            setNotes(noteList);
            setAttempts(attemptList);

        } catch (err) {
            setError(
                err.message ||
                    "Unable to load your quizzes"
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        //defer the initial load so the effect body performs no
        //synchronous state updates (load calls setLoading)
        const timeoutId = setTimeout(() => {
            load();
        }, 0);

        return () => clearTimeout(timeoutId);
    }, [load]);

    //the best graded attempt per note, for the badge on each card.
    //Compared by proportion, because two quizzes from the same note can
    //come back with a different number of questions.
    const bestResults = attempts.reduce(
        (best, attempt) => {
            if (!attempt.noteId) {
                return best;
            }

            const ratio =
                attempt.total > 0
                    ? attempt.correct / attempt.total
                    : 0;

            const current = best[attempt.noteId];

            if (!current || ratio > current.ratio) {
                best[attempt.noteId] = {
                    correct: attempt.correct,
                    total: attempt.total,
                    ratio
                };
            }

            return best;
        },
        {}
    );

    //leaving a quiz reloads the history, so a new result shows up
    const handleBack = () => {
        setActiveNote(null);
        load();
    };

    //the open quiz. The key resets the generated questions and the
    //chosen answers when a different note is picked.
    if (activeNote) {
        return (
            <div className="space-y-6">

                <button
                    type="button"
                    onClick={handleBack}
                    className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 cursor-pointer"
                >
                    <ArrowLeft size={16} />
                    Back to quizzes
                </button>

                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-start gap-4">

                        <div className="w-11 h-11 shrink-0 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Sparkles size={22} />
                        </div>

                        <div className="min-w-0">
                            <h1 className="text-xl font-bold text-gray-900">
                                {activeNote.title}
                            </h1>

                            <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                                {activeNote.preview}
                            </p>
                        </div>

                    </div>
                </div>

                <Quiz
                    key={activeNote._id}
                    noteId={activeNote._id}
                    autoGenerate
                />

            </div>
        );
    }

    return (
        <div className="space-y-6">

            <div className="flex items-start justify-between gap-4">

                <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        Quizzes
                    </h1>

                    <p className="text-sm text-gray-500 mt-1">
                        Pick one of your study notes and
                        the AI will write a quiz from it.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 disabled:opacity-50 cursor-pointer"
                >
                    <RefreshCw size={14} />
                    Refresh
                </button>

            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm py-16 text-center text-gray-500">

                    <Loader2
                        size={26}
                        className="mx-auto animate-spin mb-3"
                    />

                    Loading your quizzes...

                </div>

            ) : notes.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm py-16 text-center">

                    <ClipboardList
                        size={46}
                        className="mx-auto text-gray-300 mb-4"
                    />

                    <p className="text-gray-500">
                        No quizzes yet. Upload a study note
                        and the AI will build a quiz from it.
                    </p>

                    <button
                        type="button"
                        onClick={() => navigate("/notes")}
                        className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold cursor-pointer transition-colors"
                    >
                        <FileText size={16} />
                        Go to Study Notes
                    </button>

                </div>

            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">

                    {notes.map((note) => {
                        const best = bestResults[note._id];

                        return (
                            <div
                                key={note._id}
                                className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col"
                            >

                                <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                    <ClipboardList size={22} />
                                </div>

                                <h2 className="text-lg font-bold text-gray-900 mt-5">
                                    {note.title}
                                </h2>

                                <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                                    {note.preview}
                                </p>

                                <p className="text-xs text-gray-400 mt-3">
                                    {note.characters} characters
                                </p>

                                {best && (
                                    <p className="text-xs font-semibold text-green-600 mt-2">
                                        Best: {best.correct} /{" "}
                                        {best.total}
                                    </p>
                                )}

                                <div className="mt-auto pt-5">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setActiveNote(note)
                                        }
                                        className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold cursor-pointer transition-colors"
                                    >
                                        Start Quiz
                                    </button>
                                </div>

                            </div>
                        );
                    })}

                </div>
            )}

            {!loading && attempts.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

                    <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                        <Trophy
                            size={18}
                            className="text-blue-600"
                        />

                        <h2 className="text-lg font-bold text-gray-900">
                            Recent results
                        </h2>
                    </div>

                    <ul className="divide-y divide-gray-100">
                        {attempts
                            .slice(0, 6)
                            .map((attempt) => (
                                <li
                                    key={attempt._id}
                                    className="px-6 py-4 flex items-center justify-between gap-4"
                                >

                                    <div className="min-w-0">
                                        <p className="font-medium text-gray-900 truncate">
                                            {attempt.noteTitle}
                                        </p>

                                        <p className="text-xs text-gray-400 mt-1">
                                            {attempt.submittedAt
                                                ? new Date(
                                                      attempt.submittedAt
                                                  ).toLocaleDateString()
                                                : ""}

                                            {" · +"}
                                            {attempt.xpAwarded} XP
                                        </p>
                                    </div>

                                    <span className="shrink-0 text-sm font-semibold text-blue-600">
                                        {attempt.correct} /{" "}
                                        {attempt.total}
                                    </span>

                                </li>
                            ))}
                    </ul>

                </div>
            )}

        </div>
    );
}

export default QuizPage;
