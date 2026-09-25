import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Plus, School, Users } from "lucide-react";

import ClassManagement from "./features/users/ClassManagement";
import Login from "./features/users/Login";
import UserManagementPage from "./features/users/UserManagementPage";
import MaterialManager from "./features/materials/MaterialManager";
import StudentDashBoard from "./features/student/StudentDashboard";

import {
  getCurrentUser,
  getFilterOptions,
  getTeachers,
  logoutUser
} from "./features/users/userAPI";

//the pages of the admin/teacher shell
const MANAGEMENT_PAGES = [
  {
    id: "users",
    label: "Users",
    title: "User Management",
    icon: Users
  },
  {
    id: "classes",
    label: "Classes",
    title: "Class Management",
    icon: School
  },
  {
    id: "materials",
    label: "Subject Lessons",
    title: "Subject Lesson Uploader",
    icon: BookOpen
  }
];

//The shell around every signed-in page: it decides who is looking at the
//app, which of the admin/teacher pages is open, and what the header shows.
//
//Reference data that more than one page needs is fetched here and passed
//down -- classrooms are used by the user list and the lesson library, and
//teachers by class management -- so one request serves all of them. What
//belongs to a single page (the user list itself, its filters and dialogs)
//lives in that page.
function App() {
  const navigate = useNavigate();

  //The header's "Add User" button belongs to the shell but acts on the
  //users page, so that page exposes the one action through a ref.
  const usersPageRef = useRef(null);

  //logged-in user. This cache is only for the first paint; whether the
  //session is still valid is decided by the server, because the login
  //token itself lives in an httpOnly cookie that JS cannot read.
  const [loggedInUser, setLoggedInUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem("loggedInUser");

      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      localStorage.removeItem("loggedInUser");

      return null;
    }
  });

  //false until the server has confirmed (or rejected) the session cookie,
  //so a reload does not flash the login page
  const [sessionChecked, setSessionChecked] = useState(false);

  //Manage page
  const [managementPage, setManagementPage] = useState("users");

  //classroom and role filters, and the teacher list for class assignment
  const [classrooms, setClassrooms] = useState([]);
  const [roles, setRoles] = useState([]);
  const [teachers, setTeachers] = useState([]);

  //fetch every teacher for class assignment. The users page is told to run
  //this too, because adding, renaming or deleting a teacher changes the
  //list this page hands to ClassManagement.
  const fetchTeachers = useCallback(async () => {
    try {
      const data = await getTeachers();

      setTeachers(data.teachers || []);
    } catch (error) {
      console.error("Error fetching teachers:", error);
    }
  }, []);

  const fetchFilterOptions = useCallback(async () => {
    try {
      const data = await getFilterOptions();

      setClassrooms(data.classrooms || []);
      setRoles(data.roles || []);
    } catch (error) {
      console.error("Error fetching filter options:", error);
    }
  }, []);

  //Fetch the filter options and the teacher list once the session is known.
  //
  //Deferred, like the users page's own load: an effect body that calls a
  //function which sets state synchronously would cascade a second render,
  //which the react-hooks lint rule rejects.
  useEffect(() => {
    if (!loggedInUser || loggedInUser.role === "student") {
      return;
    }

    const timeoutId = setTimeout(() => {
      fetchFilterOptions();
      fetchTeachers();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loggedInUser, fetchFilterOptions, fetchTeachers]);

  //Ask the server who we are, once per page load. The cookie is the only
  //proof of the session, so the cached user is refreshed from it (and
  //dropped when the cookie has expired).
  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((data) => {
        if (cancelled) {
          return;
        }

        setLoggedInUser(data.user);

        localStorage.setItem(
          "loggedInUser",
          JSON.stringify(data.user)
        );
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        //no valid session cookie: forget the cached user so the login page
        //is shown
        localStorage.removeItem("loggedInUser");
        setLoggedInUser(null);
      })
      .finally(() => {
        if (!cancelled) {
          setSessionChecked(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  //logout
  const handleLogout = async () => {
    try {
      //the cookie is httpOnly, so only the server can end the session; a
      //failure here must not trap the user in the app
      await logoutUser();
    } catch (error) {
      console.error("Error logging out:", error);
    }

    localStorage.removeItem("loggedInUser");

    //the pages are unmounted by the login gate below, so nothing else has
    //to be reset here; the reference data is dropped so one session does
    //not leave it behind for the next
    setClassrooms([]);
    setRoles([]);
    setTeachers([]);

    setLoggedInUser(null);

    //leave any deep page (e.g. /notes/:id) so the next login starts on the
    //dashboard
    navigate("/");
  };

  //until the session cookie has been checked, show neither the app nor the
  //login form
  if (!loggedInUser && !sessionChecked) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        Loading...
      </div>
    );
  }

  //show login page
  if (!loggedInUser) {
    return (
      <Login onLogin={(user) => setLoggedInUser(user)} />
    );
  }

  //a student gets their own shell, not the management pages
  if (loggedInUser.role === "student") {
    return (
      <StudentDashBoard
        student={loggedInUser}
        onLogout={handleLogout}
      />
    );
  }

  //title shown for the current admin/teacher page
  const activePage =
    MANAGEMENT_PAGES.find(
      (page) => page.id === managementPage
    ) || MANAGEMENT_PAGES[0];

  const isAdmin = loggedInUser.role === "admin";

  //admin and teacher management page
  return (
    <div className="min-h-screen w-full bg-gray-950 text-gray-100 overflow-x-hidden">

      {/* Header */}
      <header className="w-full bg-gray-900 shadow-xl border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center">
          <nav className="flex items-center gap-2">
            {MANAGEMENT_PAGES.map((page) => {
              const Icon = page.icon;
              const isActive = managementPage === page.id;

              return (
                <button
                  key={page.id}
                  onClick={() => setManagementPage(page.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors cursor-pointer ${
                    isActive
                      ? "bg-green-500 border-green-500 text-gray-950 font-semibold"
                      : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  <Icon size={18} />
                  <span>{page.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500 rounded-lg">
              <Users size={28} className="text-gray-950" />
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                {activePage.title}
              </h1>

              <p className="text-xs text-gray-400">
                MERN Stack Application
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">

            {/* Logged-in user */}
            <div className="text-right">
              <p className="text-sm text-white">
                {loggedInUser.name}
              </p>

              <p className="text-xs text-gray-400 capitalize">
                {loggedInUser.role}
              </p>
            </div>

            {/* Admin-only add button, which acts on the users page */}
            {isAdmin && managementPage === "users" && (
              <button
                onClick={() =>
                  usersPageRef.current?.openCreate()
                }
                className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-gray-950 font-medium rounded-lg transition-colors cursor-pointer"
              >
                <Plus size={20} />

                <span>Add User</span>
              </button>
            )}

            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 cursor-pointer"
            >
              Logout
            </button>

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">

        {managementPage === "classes" ? (

          <ClassManagement teachers={teachers} />

        ) : managementPage === "materials" ? (

          <MaterialManager
            classrooms={classrooms}
            canManage={isAdmin}
          />

        ) : (

          <UserManagementPage
            ref={usersPageRef}
            classrooms={classrooms}
            roles={roles}
            canGrade={
              isAdmin ||
              loggedInUser.role === "teacher"
            }
            canManage={isAdmin}
            onUsersChanged={fetchTeachers}
          />

        )}

      </main>
    </div>
  );
}

export default App;
