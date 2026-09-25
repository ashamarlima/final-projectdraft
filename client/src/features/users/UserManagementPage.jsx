import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useState
} from "react";
import { Users } from "lucide-react";

import GradeModel from "./GradeModel";
import SearchBar from "./SearchBar";
import StatsCard from "./StatsCard";
import UserModel from "./UserModel";
import UserTable from "./UserTable";

import {
  addUser,
  deleteUser,
  getStats,
  getUsers,
  searchUsers,
  updateGrades,
  updateUser
} from "./userAPI";

//the two states a user account can be in
const STATUS_OPTIONS = ["active", "inactive"];

//The Users page of the admin/teacher shell: the list, its search and
//filters, the pagination, and the create/edit/grade dialogs.
//
//The reference data that other pages need too (classrooms, roles) is
//fetched by the shell and passed in, so this page issues no request of its
//own for it.
//
//`ref` exposes the single action the shell's header button needs. That
//button lives outside this page, which is the only reason this page cannot
//own its dialogs entirely.
function UserManagementPage({
  ref,
  classrooms = [],
  roles = [],
  canGrade = false,
  canManage = false,
  onUsersChanged
}) {
  const [users, setUsers] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);

  const [stats, setStats] = useState({
    active: 0,
    inactive: 0
  });

  const [searchTerm, setSearchTerm] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);

  //the user being edited, or null when a new one is being added. The field
  //values live in the modal's own form until it is submitted.
  const [editingItem, setEditingItem] = useState(null);

  const [loading, setLoading] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemPerPage, setItemPerPage] = useState(5);
  const [totalPages, setTotalPages] = useState(0);

  const [selectedClassroom, setSelectedClassroom] = useState("");
  const [selectedRole, setSelectedRole] = useState("");

  //grading
  const [isGradeModalOpen, setIsGradeModalOpen] = useState(false);
  const [gradingStudent, setGradingStudent] = useState(null);
  const [gradeLoading, setGradeLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const data = await getStats();

      setStats(data);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  }, []);

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
      console.error("Error fetching users:", error);
    }
  }, [
    currentPage,
    itemPerPage,
    selectedClassroom,
    selectedRole,
    fetchStats
  ]);

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
      console.error("Error searching users:", error);
    }
  }, [
    searchTerm,
    currentPage,
    itemPerPage,
    selectedClassroom,
    selectedRole
  ]);

  //Refetch on every filter or page change, debounced so typing in the
  //search box does not fire a request per keystroke.
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchTerm.trim()) {
        handleSearch();
      } else {
        fetchUsers();
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, fetchUsers, handleSearch]);

  //create or update user. `values` is read off the modal's form when it is
  //submitted, so nothing is collected while the user types.
  const handleSubmit = async (values) => {
    if (
      !values.name ||
      !values.email ||
      !values.phone ||
      (!editingItem && !values.password)
    ) {
      return alert("Please fill in all required fields");
    }

    setLoading(true);

    try {
      if (editingItem) {
        await updateUser(editingItem._id, values);
      } else {
        await addUser(values);
      }

      await fetchUsers();

      //a user may have been a teacher, so the class page's list is stale
      await onUsersChanged?.();

      closeModel();
    } catch (error) {
      console.error("Error saving user:", error);

      alert(error.message || "Failed to save user");
    } finally {
      setLoading(false);
    }
  };

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

      //a deleted teacher has to leave the class page's list
      await onUsersChanged?.();
    } catch (error) {
      console.error("Error deleting user:", error);

      alert(error.message || "Failed to delete user");
    }
  };

  //open user modal. The modal prefills itself from `editingItem`, so no
  //field values are copied up into this component.
  const openModel = (item = null) => {
    setEditingItem(item || null);
    setIsModalOpen(true);
  };

  const closeModel = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  //the shell's header button opens the blank form from outside this page
  useImperativeHandle(ref, () => ({
    openCreate: () => openModel()
  }));

  //open grade modal. The modal prefills itself from `gradingStudent`.
  const openGradeModel = (student) => {
    if (!student || student.role !== "student") {
      return;
    }

    setGradingStudent(student);
    setIsGradeModalOpen(true);
  };

  const closeGradeModel = () => {
    setIsGradeModalOpen(false);
    setGradingStudent(null);
  };

  //save student grades. `values` are the raw field strings from the grade
  //form, read when it is submitted.
  const handleGradeSubmit = async (values) => {
    if (!gradingStudent) {
      return alert("No student was selected");
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

    const invalidGrade = Object.values(gradePayload).some(
      (grade) =>
        grade !== null &&
        (Number.isNaN(grade) || grade < 0 || grade > 100)
    );

    if (invalidGrade) {
      return alert("Every grade must be between 0 and 100");
    }

    setGradeLoading(true);

    try {
      await updateGrades(gradingStudent._id, gradePayload);

      await fetchUsers();
      closeGradeModel();
    } catch (error) {
      console.error("Error updating grades:", error);

      alert(error.message || "Failed to update grades");
    } finally {
      setGradeLoading(false);
    }
  };

  return (
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
        selectedClassroom={selectedClassroom}
        selectedRole={selectedRole}
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
        canGrade={canGrade}
        canManage={canManage}
      />

      {/* User Modal */}
      <UserModel
        key={editingItem?._id || "new-user"}
        isOpen={isModalOpen}
        closeModel={closeModel}
        item={editingItem}
        onSubmit={handleSubmit}
        loading={loading}
        status={STATUS_OPTIONS}
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
  );
}

export default UserManagementPage;
