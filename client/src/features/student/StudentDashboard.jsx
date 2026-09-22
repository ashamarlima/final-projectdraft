import React, {
    useState
} from "react";

import {
    Navigate,
    NavLink,
    Route,
    Routes,
    useLocation,
    useMatch,
    useNavigate,
    useParams
} from "react-router-dom";

import {
    Bell,
    BookOpen,
    Bot,
    ChevronDown,
    ChevronRight,
    ClipboardList,
    FileText,
    LayoutDashboard,
    Medal,
    Trophy,
    User,
    Zap
} from "lucide-react";

import StudentAIChat
    from "../ai/StudentAIChat";

import DashboardPage
    from "./DashboardPage";

import LearnPage
    from "./LearnPage";

import SubjectPage
    from "./SubjectPage";

import QuizPage
    from "./QuizPage";

import LeaderboardPage
    from "./LeaderboardPage";

import AchievementsPage
    from "./AchievementsPage";

import ProfilePage
    from "./ProfilePage";
import StudentGrade
    from "./StudentGrade";

import NotesPage
    from "../notes/NotesPage";

import NoteViewPage
    from "../notes/NoteViewPage";

import LessonAIView
    from "../materials/LessonAIView";


//page title shown in the header, keyed by route path
const PAGE_TITLES = {
    "/": "Dashboard",
    "/learn": "Learning Path",
    "/ai": "AI Study Assistant",
    "/notes": "Study Notes",
    "/quizzes": "Quizzes",
    "/leaderboard": "Leaderboard",
    "/achievements": "Achievements",
    "/profile": "Profile",
    "/grades": "My Grades"
};


//subject detail route (/subjects/:subject)
function SubjectRoute({ student }) {
    const { subject } = useParams();

    return (
        <SubjectPage
            subject={subject}
            student={student}
        />
    );
}


function StudentDashboard({
    student,
    onLogout
}) {
    const location = useLocation();
    const navigate = useNavigate();

    const subjectMatch = useMatch(
        "/subjects/:subject"
    );

    const [subjectsOpen, setSubjectsOpen] =
        useState(false);

    const menuItems = [
        {
            label: "Dashboard",
            icon: LayoutDashboard,
            to: "/"
        },
        {
            label: "Learn",
            icon: BookOpen,
            to: "/learn"
        },
        {
            label: "AI Chat",
            icon: Bot,
            to: "/ai"
        },
        {
            label: "Study Notes",
            icon: FileText,
            to: "/notes"
        },
        {
            label: "Quizzes",
            icon: ClipboardList,
            to: "/quizzes"
        },
        {
            label: "Leaderboard",
            icon: Trophy,
            to: "/leaderboard"
        },
        {
            label: "Achievements",
            icon: Medal,
            to: "/achievements"
        },
        {
            label: "Profile",
            icon: User,
            to: "/profile"
        },
        {
            label: "Grades",
            icon: BookOpen,
            to: "/grades"
        }
    ];


    const subjectNavItems = [
        "Mathematics",
        "Science",
        "English"
    ];


    //header title for the current route
    let currentTitle = PAGE_TITLES[location.pathname];

    if (!currentTitle) {
        if (subjectMatch) {
            currentTitle =
                subjectMatch.params.subject;
        } else if (
            location.pathname.startsWith(
                "/notes/"
            )
        ) {
            currentTitle = "Study Notes";
        } else if (
            location.pathname.startsWith(
                "/lessons/"
            )
        ) {
            currentTitle = "Lesson";
        } else {
            currentTitle = "Dashboard";
        }
    }


    //keep the subject list open while a subject is being viewed
    const onSubjectRoute =
        location.pathname.startsWith(
            "/subjects"
        );

    const showSubjects =
        subjectsOpen || onSubjectRoute;


    return (
        <div className="h-screen w-full bg-[#f6f8fc] text-gray-800 flex overflow-hidden">

            {/* Sidebar */}
            <aside className="w-64 shrink-0 h-screen bg-[#0b1739] text-white flex flex-col border-r border-blue-900">

                {/* Logo */}
                <div className="px-6 py-6 border-b border-blue-900">

                    <div className="flex items-center gap-3">

                        <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center font-bold text-white">
                            📘
                        </div>

                        <h1 className="text-xl font-bold text-white">
                            SmartEdu
                        </h1>

                    </div>

                </div>

                {/* Navigation */}
                <nav className="p-4 flex-1 overflow-y-auto">

                    <div className="space-y-2">

                        {menuItems.map(
                            (
                                item,
                                index
                            ) => {
                                const Icon =
                                    item.icon;

                                return (
                                    <React.Fragment
                                        key={index}
                                    >

                                        <NavLink
                                            to={item.to}
                                            end={
                                                item.to ===
                                                "/"
                                            }
                                            className={({
                                                isActive
                                            }) =>
                                                `w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left transition-all cursor-pointer ${
                                                    isActive
                                                        ? "bg-[#172657] text-white"
                                                        : "text-gray-300 hover:bg-white/5 hover:text-white"
                                                }`
                                            }
                                        >

                                            <Icon
                                                size={18}
                                            />

                                            <span>
                                                {
                                                    item.label
                                                }
                                            </span>

                                        </NavLink>


                                        {/* Subject dropdown after Learn */}
                                        {item.to ===
                                            "/learn" && (

                                                <div>

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setSubjectsOpen(
                                                                !subjectsOpen
                                                            )
                                                        }
                                                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all cursor-pointer ${
                                                            onSubjectRoute
                                                                ? "bg-[#172657] text-white"
                                                                : "text-gray-300 hover:bg-white/5 hover:text-white"
                                                        }`}
                                                    >

                                                        <div className="flex items-center gap-3">

                                                            <BookOpen
                                                                size={18}
                                                            />

                                                            <span>
                                                                Subjects
                                                            </span>

                                                        </div>


                                                        {showSubjects ? (

                                                            <ChevronDown
                                                                size={16}
                                                            />

                                                        ) : (

                                                            <ChevronRight
                                                                size={16}
                                                            />

                                                        )}

                                                    </button>


                                                    {showSubjects && (

                                                        <div className="ml-5 mt-1 space-y-1">

                                                            {subjectNavItems.map(
                                                                (
                                                                    subject
                                                                ) => (

                                                                    <NavLink
                                                                        key={
                                                                            subject
                                                                        }
                                                                        to={`/subjects/${subject}`}
                                                                        className={({
                                                                            isActive
                                                                        }) =>
                                                                            `block w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all cursor-pointer ${
                                                                                isActive
                                                                                    ? "bg-[#213774] text-white"
                                                                                    : "text-gray-400 hover:bg-white/5 hover:text-white"
                                                                            }`
                                                                        }
                                                                    >
                                                                        {
                                                                            subject
                                                                        }
                                                                    </NavLink>

                                                                )
                                                            )}

                                                        </div>

                                                    )}

                                                </div>

                                            )}

                                    </React.Fragment>
                                );
                            }
                        )}

                    </div>

                </nav>


                {/* Logout */}
                <div className="p-4 border-t border-blue-900">

                    <button
                        type="button"
                        onClick={onLogout}
                        className="w-full px-4 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors cursor-pointer"
                    >
                        Logout
                    </button>

                </div>

            </aside>


            {/* Right Side */}
            <div className="flex-1 min-w-0 h-screen flex flex-col overflow-hidden">

                {/* Header */}
                <header className="h-20 shrink-0 bg-white border-b border-gray-200 px-8 flex items-center justify-between">

                    <h2 className="text-2xl font-bold text-gray-800">
                        {
                            currentTitle
                        }
                    </h2>


                    <div className="flex items-center gap-3">

                        <div className="hidden sm:block px-4 py-2 rounded-full bg-blue-50 text-blue-500 text-sm font-semibold">
                            Level{" "}
                            {student?.level || 1}
                        </div>


                        <div className="hidden md:flex px-4 py-2 rounded-full bg-indigo-50 text-indigo-500 text-sm font-semibold items-center gap-2">

                            <Zap
                                size={16}
                            />

                            {(student?.xp || 0).toLocaleString()}{" "}
                            XP

                        </div>


                        <button
                            type="button"
                            className="p-2 rounded-full text-gray-700 hover:bg-gray-100 cursor-pointer"
                        >

                            <Bell
                                size={20}
                            />

                        </button>


                        <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-sm font-bold text-gray-800">

                            {
                                student?.name
                                    ?.charAt(0)
                                    ?.toUpperCase() ||
                                "U"
                            }

                        </div>

                    </div>

                </header>


                {/* Routed Content */}
                <main className="flex-1 overflow-y-auto p-6 lg:p-8">

                    <Routes>

                        <Route
                            index
                            element={
                                <DashboardPage
                                    student={student}
                                />
                            }
                        />

                        <Route
                            path="learn"
                            element={
                                <LearnPage
                                    student={student}
                                    onOpenSubject={(
                                        subject
                                    ) =>
                                        navigate(
                                            `/subjects/${subject}`
                                        )
                                    }
                                />
                            }
                        />

                        <Route
                            path="subjects/:subject"
                            element={
                                <SubjectRoute
                                    student={student}
                                />
                            }
                        />

                        {/* One lesson PDF, with its AI assistant,
                            flashcards and quiz. */}
                        <Route
                            path="lessons/:id"
                            element={<LessonAIView />}
                        />

                        <Route
                            path="ai"
                            element={
                                <StudentAIChat
                                    student={student}
                                />
                            }
                        />

                        <Route
                            path="notes"
                            element={<NotesPage />}
                        />

                        <Route
                            path="notes/:id"
                            element={<NoteViewPage />}
                        />

                        <Route
                            path="quizzes"
                            element={<QuizPage />}
                        />

                        <Route
                            path="leaderboard"
                            element={
                                <LeaderboardPage
                                    student={student}
                                />
                            }
                        />

                        <Route
                            path="achievements"
                            element={
                                <AchievementsPage
                                    student={student}
                                />
                            }
                        />

                        <Route
                            path="profile"
                            element={
                                <ProfilePage
                                    student={student}
                                />
                            }
                        />

                        <Route
                            path="grades"
                            element={
                                <StudentGrade
                                    student={student}
                                />
                            }
                        />

                        <Route
                            path="*"
                            element={
                                <Navigate
                                    to="/"
                                    replace
                                />
                            }
                        />

                    </Routes>

                </main>

            </div>

        </div>
    );
}


export default StudentDashboard;
