import {
    useCallback,
    useEffect,
    useState
} from "react";
import {
    Award,
    Loader2,
    Trophy
} from "lucide-react";
import { getLeaderboard } from "../users/userAPI";


//rank badge colours for the top three places
const rankClass = (rank) => {
    if (rank === 1) {
        return "bg-yellow-100 text-yellow-700";
    }

    if (rank === 2) {
        return "bg-gray-200 text-gray-700";
    }

    if (rank === 3) {
        return "bg-orange-100 text-orange-700";
    }

    return "bg-gray-100 text-gray-600";
};


function LeaderboardPage({ student }) {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadLeaderboard = useCallback(
        async () => {
            setLoading(true);
            setError("");

            try {
                setEntries(await getLeaderboard());
            } catch (err) {
                setError(
                    err.message ||
                        "Unable to load the leaderboard"
                );
            } finally {
                setLoading(false);
            }
        },
        []
    );

    useEffect(() => {
        //defer so the effect body performs no synchronous
        //state updates (loadLeaderboard calls setLoading)
        const timeoutId = setTimeout(() => {
            loadLeaderboard();
        }, 0);

        return () => clearTimeout(timeoutId);
    }, [loadLeaderboard]);

    const isCurrent = (entry) =>
        entry.isCurrentUser ||
        (student?._id &&
            String(entry._id) === String(student._id));


    return (
        <div className="space-y-6">

            <div>

                <h1 className="text-2xl font-bold text-gray-900">
                    Leaderboard
                </h1>

                <p className="text-sm text-gray-500 mt-1">
                    Compare your XP with other students in
                    grade {student?.classroom || "your grade"}.
                </p>

            </div>


            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

                <div className="p-6 border-b border-gray-200 flex items-center gap-3">

                    <Trophy
                        size={22}
                        className="text-yellow-500"
                    />

                    <h2 className="text-lg font-bold text-gray-900">
                        Grade Ranking
                    </h2>

                </div>

                {loading ? (
                    <div className="py-16 text-center text-gray-500">

                        <Loader2
                            size={26}
                            className="mx-auto animate-spin mb-3"
                        />

                        Loading the leaderboard...
                    </div>

                ) : error ? (
                    <div className="p-6">

                        <p className="text-sm text-red-600">
                            {error}
                        </p>

                        <button
                            type="button"
                            onClick={loadLeaderboard}
                            className="mt-4 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold cursor-pointer transition-colors"
                        >
                            Try again
                        </button>

                    </div>

                ) : entries.length === 0 ? (
                    <div className="py-16 text-center text-gray-500">
                        No students in your grade level yet.
                    </div>

                ) : (
                    <div className="divide-y divide-gray-100">

                        {entries.map((entry) => (
                            <div
                                key={entry._id}
                                className={`px-6 py-4 flex items-center justify-between ${
                                    isCurrent(entry)
                                        ? "bg-blue-50"
                                        : ""
                                }`}
                            >

                                <div className="flex items-center gap-4">

                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${rankClass(
                                            entry.rank
                                        )}`}
                                    >
                                        {entry.rank}
                                    </div>


                                    <div>

                                        <p className="font-semibold text-gray-900">
                                            {entry.name}
                                        </p>

                                        {isCurrent(entry) && (
                                            <p className="text-xs text-blue-600">
                                                Your position
                                            </p>
                                        )}

                                    </div>

                                </div>


                                <div className="text-right">

                                    <div className="flex items-center gap-2 justify-end">

                                        <Award
                                            size={16}
                                            className="text-indigo-500"
                                        />

                                        <span className="font-semibold text-gray-800">
                                            {entry.xp.toLocaleString()} XP
                                        </span>

                                    </div>

                                    <p className="text-xs text-gray-400 mt-1">
                                        Level {entry.level}
                                    </p>

                                </div>

                            </div>
                        ))}

                    </div>
                )}

            </div>

        </div>
    );
}


export default LeaderboardPage;
