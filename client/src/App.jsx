import { BookOpen, Users, Plus, School } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ClassManagement from './features/users/ClassManagement';
import StatsCard from './features/users/StatsCard';
import SearchBar from './features/users/SearchBar';
import UserTable from './features/users/UserTable';
import UserModel from './features/users/UserModel';
import Login from './features/users/Login';
import GradeModel from './features/users/GradeModel';
import StudentDashBoard from './features/student/StudentDashboard';
import MaterialManager from './features/materials/MaterialManager';
import {
  getUsers,
  searchUsers,
  getStats,
  addUser,
  updateUser,
  deleteUser,
  getFilterOptions,
  getTeachers,
  updateGrades,
  getCurrentUser,
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

function App() {
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);

  const [stats, setStats] = useState({
    active: 0,
    inactive: 0
  });

  const [searchTerm, setSearchTerm] = useState("");

  const [isModalOpen, setIsModalOpen] =
    useState(false);

  //the user being edited, or null when a new one is being added. The
  //field values live in the modal's own form until it is submitted.
  const [editingItem, setEditingItem] =
    useState(null);

  const [loading, setLoading] =
    useState(false);

  const [currentPage, setCurrentPage] =
    useState(1);

  const [itemPerPage, setItemPerPage] =
    useState(5);

  const [totalPages, setTotalPages] =
    useState(0);

  const status = [
    "active",
    "inactive"
  ];
  //Manage page
  const [
    managementPage,
    setManagementPage
  ] = useState("users");
  //const handlesubmit
  //classroom and role filters

  const [classrooms, setClassrooms] =
    useState([]);

  const [roles, setRoles] =
    useState([]);

  const [teachers, setTeachers] =
    useState([]);

  const [
    selectedClassroom,
    setSelectedClassroom
  ] = useState("");

  const [
    selectedRole,
    setSelectedRole
  ] = useState("");

  //grading
  const [
    isGradeModalOpen,
    setIsGradeModalOpen
  ] = useState(false);

  const [
    gradingStudent,
    setGradingStudent
  ] = useState(null);

  const [
    gradeLoading,
    setGradeLoading
  ] = useState(false);

  //logged-in user. This cache is only for the first paint; whether the
  //session is still valid is decided by the server, because the login
  //token itself lives in an httpOnly cookie that JS cannot read.
  const [
    loggedInUser,
    setLoggedInUser
  ] = useState(() => {
    try {
      const savedUser =
        localStorage.getItem("loggedInUser");

      return savedUser
        ? JSON.parse(savedUser)
        : null;

    } catch {
      localStorage.removeItem("loggedInUser");

      return null;
    }
  });

  //false until the server has confirmed (or rejected) the session
  //cookie, so a reload does not flash the login page
  const [
    sessionChecked,
    setSessionChecked
  ] = useState(false);

  //fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const data = await getStats();

      setStats(data);

    } catch (error) {
      console.error(
        "Error fetching stats:",
        error
      );
    }
  }, []);

  //fetch users
  const fetchUsers = useCallback(async () => {
    try {
      const data = await getUsers(
        currentPage,
        itemPerPage,
        selectedClassroom,
        selectedRole
      );

      setUsers(data.users || []);
      setTotalUsers(data.totalUsers || 0);
      setTotalPages(data.totalPages || 0);

      await fetchStats();

    } catch (error) {
      console.error(
        "Error fetching users:",
        error
      );
    }
  }, [
    currentPage,
    itemPerPage,
    selectedClassroom,
    selectedRole,
    fetchStats
  ]);

  //search users
  const handleSearch = useCallback(async () => {
    try {
      const data = await searchUsers(
        searchTerm,
        currentPage,
        itemPerPage,
        selectedClassroom,
        selectedRole
      );

      setUsers(data.users || []);
      setTotalUsers(data.totalUsers || 0);
      setTotalPages(data.totalPages || 0);

    } catch (error) {
      console.error(
        "Error searching users:",
        error
      );
    }
  }, [
    searchTerm,
    currentPage,
    itemPerPage,
    selectedClassroom,
    selectedRole
  ]);

  //fetch management users after login
  useEffect(() => {
    if (
      !loggedInUser ||
      loggedInUser.role === "student"
    ) {
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      if (searchTerm.trim()) {
        handleSearch();
      } else {
        fetchUsers();
      }
    }, 300);

    return () =>
      clearTimeout(delayDebounceFn);

  }, [
    loggedInUser,
    searchTerm,
    fetchUsers,
    handleSearch
  ]);

  //fetch filter options for admin and teacher
  useEffect(() => {
    if (
      !loggedInUser ||
      loggedInUser.role === "student"
    ) {
      return;
    }

    let cancelled = false;

    getFilterOptions()
      .then((data) => {
        if (cancelled) {
          return;
        }

        setClassrooms(data.classrooms || []);
        setRoles(data.roles || []);
      })
      .catch((error) => {
        console.error(
          "Error fetching filter options:",
          error
        );
      });

    return () => {
      cancelled = true;
    };
  }, [loggedInUser]);

  //fetch every teacher for class assignment
  const fetchTeachers = useCallback(async () => {
    try {
      const data = await getTeachers();

      setTeachers(data.teachers || []);

    } catch (error) {
      console.error(
        "Error fetching teachers:",
        error
      );
    }
  }, []);

  useEffect(() => {
    if (
      !loggedInUser ||
      loggedInUser.role === "student"
    ) {
      return;
    }

    let cancelled = false;

    getTeachers()
      .then((data) => {
        if (cancelled) {
          return;
        }

        setTeachers(data.teachers || []);
      })
      .catch((error) => {
        console.error(
          "Error fetching teachers:",
          error
        );
      });

    return () => {
      cancelled = true;
    };
  }, [loggedInUser]);

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

        //no valid session cookie: forget the cached user so the
        //login page is shown
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

  //create or update user. `values` is read off the modal's form when it
  //is submitted, so nothing is collected while the user types.
  const handleSubmit = async (values) => {
    if (
      !values.name ||
      !values.email ||
      !values.phone ||
      (
        !editingItem &&
        !values.password
      )
    ) {
      return alert(
        "Please fill in all required fields"
      );
    }

    setLoading(true);

    try {
      if (editingItem) {
        await updateUser(
          editingItem._id,
          values
        );

      } else {
        await addUser(values);
      }

      await fetchUsers();
      await fetchTeachers();
      closeModel();

    } catch (error) {
      console.error(
        "Error saving user:",
        error
      );

      alert(
        error.message ||
        "Failed to save user"
      );

    } finally {
      setLoading(false);
    }
  };

  //delete user
  const handleDelete = async (id) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this user?"
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteUser(id);
      await fetchUsers();
      await fetchTeachers();

    } catch (error) {
      console.error(
        "Error deleting user:",
        error
      );

      alert(
        error.message ||
        "Failed to delete user"
      );
    }
  };

  //open user modal. The modal prefills itself from `editingItem`, so no
  //field values are copied up into this component.
  const openModel = (item = null) => {
    setEditingItem(item || null);
    setIsModalOpen(true);
  };

  //close user modal
  const closeModel = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  //open grade modal. The modal prefills itself from `gradingStudent`.
  const openGradeModel = (student) => {
    if (
      !student ||
      student.role !== "student"
    ) {
      return;
    }

    setGradingStudent(student);
    setIsGradeModalOpen(true);
  };

  //close grade modal
  const closeGradeModel = () => {
    setIsGradeModalOpen(false);
    setGradingStudent(null);
  };

  //save student grades. `values` are the raw field strings from the
  //grade form, read when it is submitted.
  const handleGradeSubmit = async (values) => {
    if (!gradingStudent) {
      return alert(
        "No student was selected"
      );
    }

    //an empty field clears that grade, which the server wants as null
    const gradeOf = (value) =>
      value === "" || value === undefined
        ? null
        : Number(value);

    const gradePayload = {
      Math: gradeOf(values.Math),
      Literature: gradeOf(values.Literature),
      Science: gradeOf(values.Science)
    };

    const invalidGrade = Object.values(
      gradePayload
    ).some(
      (grade) =>
        grade !== null &&
        (
          Number.isNaN(grade) ||
          grade < 0 ||
          grade > 100
        )
    );

    if (invalidGrade) {
      return alert(
        "Every grade must be between 0 and 100"
      );
    }

    setGradeLoading(true);

    try {
      await updateGrades(
        gradingStudent._id,
        gradePayload
      );

      await fetchUsers();
      closeGradeModel();

    } catch (error) {
      console.error(
        "Error updating grades:",
        error
      );

      alert(
        error.message ||
        "Failed to update grades"
      );

    } finally {
      setGradeLoading(false);
    }
  };

  //logout
  const handleLogout = async () => {
    try {
      //the cookie is httpOnly, so only the server can end the
      //session; a failure here must not trap the user in the app
      await logoutUser();

    } catch (error) {
      console.error(
        "Error logging out:",
        error
      );
    }

    localStorage.removeItem(
      "loggedInUser"
    );

    setUsers([]);
    setClassrooms([]);
    setRoles([]);
    setTeachers([]);

    setSelectedClassroom("");
    setSelectedRole("");
    setSearchTerm("");

    setCurrentPage(1);
    setTotalUsers(0);
    setTotalPages(0);

    setStats({
      active: 0,
      inactive: 0
    });

    closeModel();
    closeGradeModel();

    setLoggedInUser(null);

    //leave any deep page (e.g. /notes/:id) so the next login
    //starts on the dashboard
    navigate("/");
  };

  //until the session cookie has been checked, show neither the app nor
  //the login form
  if (!loggedInUser && !sessionChecked) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        Loading...
      </div>
    );
  }

  //show login page  //login
  if (!loggedInUser) {
    return (
      <Login
        onLogin={(user) =>
          setLoggedInUser(user)
        }
      />
    );
  }
  //totlaUsers
  //show separate student grade page
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

  //admin and teacher management page
  return (
    <div className="min-h-screen w-full bg-gray-950 text-gray-100 overflow-x-hidden">

      {/* Header */}
      <header className="w-full bg-gray-900 shadow-xl border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center">
          <nav className="flex items-center gap-2">
            {MANAGEMENT_PAGES.map((page) => {
              const Icon = page.icon;
              const isActive =
                managementPage === page.id;

              return (
                <button
                  key={page.id}
                  onClick={() =>
                    setManagementPage(page.id)
                  }
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
          {/* Left Side */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500 rounded-lg">
              <Users
                size={28}
                className="text-gray-950"
              />
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

          {/* Right Side */}
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

            {/* Admin-only add button */}
            {loggedInUser.role === "admin" &&
              managementPage === "users" && (
                <button
                  onClick={() => openModel()}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-gray-950 font-medium rounded-lg transition-colors cursor-pointer"
                >
                  <Plus size={20} />

                  <span>
                    Add User
                  </span>
                </button>
              )}

            {/* Logout button */}
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

          <ClassManagement
            teachers={teachers}
          />

        ) : managementPage === "materials" ? (

          <MaterialManager
            classrooms={classrooms}

            canManage={
              loggedInUser.role === "admin"
            }
          />

        ) : (

          <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">

              <StatsCard
                title="Total Users"
                number={totalUsers}
                description="All registered users"
                IconComponent={Users}
                iconColor="text-blue-500"
              />

              <StatsCard
                title="Active Users"
                number={stats.active || 0}
                description="Currently active"
                IconComponent={Users}
                iconColor="text-green-500"
              />

              <StatsCard
                title="Inactive Users"
                number={stats.inactive || 0}
                description="Currently inactive"
                IconComponent={Users}
                iconColor="text-red-500"
              />

            </div>

            {/* Search */}
            <SearchBar
              value={searchTerm}

              onChange={(value) => {
                setSearchTerm(value);
                setCurrentPage(1);
              }}

              onClear={() => {
                setSearchTerm("");
                setCurrentPage(1);
              }}

              itemperpage={itemPerPage}

              onItemPerPageChange={(value) => {
                setItemPerPage(value);
                setCurrentPage(1);
              }}

              totalUsers={totalUsers}
              currentPage={currentPage}

              classrooms={classrooms}
              roles={roles}

              selectedClassroom={
                selectedClassroom
              }

              selectedRole={
                selectedRole
              }

              onClassroomChange={(value) => {
                setSelectedClassroom(value);
                setCurrentPage(1);
              }}

              onRoleChange={(value) => {
                setSelectedRole(value);
                setCurrentPage(1);
              }}
            />

            {/* User Table */}
            <UserTable
              users={users}
              onGrade={openGradeModel}
              onEdit={openModel}
              onDelete={handleDelete}
              currentPage={currentPage}
              onChange={setCurrentPage}
              totalPages={totalPages}

              canGrade={
                loggedInUser.role === "admin" ||
                loggedInUser.role === "teacher"
              }

              canManage={
                loggedInUser.role === "admin"
              }
            />

            {/* User Modal */}
            <UserModel
              key={editingItem?._id || "new-user"}
              isOpen={isModalOpen}
              closeModel={closeModel}
              item={editingItem}
              onSubmit={handleSubmit}
              loading={loading}
              status={status}
              classrooms={classrooms}
            />

            {/* Grade Modal */}
            <GradeModel
              key={gradingStudent?._id || "no-student"}
              isOpen={isGradeModalOpen}
              closeModel={closeGradeModel}
              student={gradingStudent}
              onSubmit={handleGradeSubmit}
              loading={gradeLoading}
            />

          </>
        )}

      </main>
    </div>
  );
}

export default App;