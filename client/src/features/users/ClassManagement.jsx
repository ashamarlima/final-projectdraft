import { useState, useEffect, useCallback, useRef } from "react";
import {
  School,
  Plus,
  Users,
  UserRound,
  BookOpen,
  Trash2
} from "lucide-react";
import { createClass, fetchClasses, removeClass } from "./userAPI";
import { readFormValues } from "../../shared/form/readFormValues";

function ClassManagement({ teachers = [] }) {
  //The create form is uncontrolled: its values are read once, on submit,
  //so typing a class name does not re-render the class list beside it.
  const formRef = useRef(null);

  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadClasses = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetchClasses();
      setClasses(response.data);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    //defer the initial load so the effect body performs no
    //synchronous state updates (loadClasses calls setLoading)
    const timeoutId = setTimeout(() => {
      loadClasses();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadClasses]);

  const handleCreateClass = async (e) => {
    e.preventDefault();

    const values = readFormValues(formRef.current);

    if (
      !values.name ||
      !values.grade ||
      !values.teacher
    ) {
      return alert(
        "Please complete all class information"
      );
    }

    try {
      setLoading(true);

      await createClass({
        name: values.name,
        grade: values.grade,
        teacher: values.teacher
      });

      //back to the blanks the form opened with
      formRef.current?.reset();

      await loadClasses();
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClass = async (id) => {
    if (!window.confirm("Are you sure you want to delete this class?")) return;
    
    try {
      setLoading(true);
      await removeClass(id);
      await loadClasses();
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>

      {/* Page title */}
      <div className="mb-8 text-left">
        <h2 className="text-2xl font-bold text-white">
          Class Management
        </h2>

        <p className="text-gray-400 mt-1">
          Create classes and assign teachers
        </p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-left">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">
                Total Classes
              </p>

              <p className="text-3xl font-bold text-white mt-2">
                {classes.length}
              </p>
            </div>

            <div className="p-3 bg-green-500/10 rounded-lg">
              <School
                size={28}
                className="text-green-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-left">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">
                Teachers
              </p>

              <p className="text-3xl font-bold text-white mt-2">
                {teachers.length}
              </p>
            </div>

            <div className="p-3 bg-blue-500/10 rounded-lg">
              <UserRound
                size={28}
                className="text-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-left">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">
                Total Students
              </p>

              <p className="text-3xl font-bold text-white mt-2">
                {classes.reduce(
                  (total, classItem) =>
                    total +
                    (classItem.students?.length || 0),
                  0
                )}
              </p>
            </div>

            <div className="p-3 bg-purple-500/10 rounded-lg">
              <Users
                size={28}
                className="text-purple-500"
              />
            </div>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Create Class Form */}
        <div className="lg:col-span-1">

          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">

            <div className="p-6 border-b border-gray-800 text-left">

              <div className="flex items-center gap-3">

                <div className="p-2 bg-green-500 rounded-lg">
                  <Plus
                    size={22}
                    className="text-gray-950"
                  />
                </div>

                <div>
                  <h2 className="text-xl font-bold text-white">
                    Create Class
                  </h2>

                  <p className="text-sm text-gray-400">
                    Add a new classroom
                  </p>
                </div>

              </div>
            </div>

            <form
              ref={formRef}
              onSubmit={handleCreateClass}
              className="p-6 space-y-5 text-left"
            >

              {/* Class Name */}
              <div>
                <label className="block text-gray-300 font-medium mb-2">
                  Class Name *
                </label>

                <input
                  name="name"
                  type="text"
                  defaultValue=""
                  placeholder="Example: Class 9A"
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>

              {/* Grade */}
              <div>
                <label className="block text-gray-300 font-medium mb-2">
                  Grade *
                </label>

                <select
                  name="grade"
                  defaultValue="9"
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none cursor-pointer"
                >
                  <option value="9">
                    Grade 9
                  </option>

                  <option value="10">
                    Grade 10
                  </option>

                  <option value="11">
                    Grade 11
                  </option>

                  <option value="12">
                    Grade 12
                  </option>
                </select>
              </div>

              {/* Assigned Teacher */}
              <div>
                <label className="block text-gray-300 font-medium mb-2">
                  Assign Teacher *
                </label>

                <select
                  name="teacher"
                  defaultValue=""
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none cursor-pointer"
                >

                  <option value="">
                    Select teacher
                  </option>

                  {teachers.map(
                    (teacher) => (
                      <option
                        key={teacher._id}
                        value={teacher._id}
                      >
                        {teacher.name}
                      </option>
                    )
                  )}

                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-semibold rounded-lg transition-all cursor-pointer"
              >
                <Plus size={20} />
                {loading ? "Saving..." : "Create Class"}
              </button>

            </form>

          </div>
        </div>

        {/* Existing classes */}
        <div className="lg:col-span-2">

          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">

            <div className="p-6 border-b border-gray-800 text-left">

              <h2 className="text-xl font-bold text-white">
                Existing Classes
              </h2>

              <p className="text-sm text-gray-400">
                View and manage created classes
              </p>

            </div>

            <div className="p-6">

              {classes.length === 0 ? (
                <div className="py-16 text-center">

                  <School
                    size={50}
                    className="mx-auto text-gray-600 mb-4"
                  />

                  <p className="text-gray-400">
                    No classes created yet
                  </p>

                </div>
              ) : (

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

                  {classes.map(
                    (classItem) => (

                      <div
                        key={classItem._id}
                        className="bg-gray-800 border border-gray-700 rounded-lg p-5 text-left hover:border-gray-600 transition-all"
                      >

                        {/* Card header */}
                        <div className="flex items-start justify-between mb-5">

                          <div className="flex items-center gap-3">

                            <div className="p-3 bg-green-500/10 rounded-lg">
                              <BookOpen
                                size={24}
                                className="text-green-500"
                              />
                            </div>

                            <div>
                              <h3 className="font-bold text-white text-lg">
                                {classItem.name}
                              </h3>

                              <p className="text-sm text-gray-400">
                                Grade{" "}
                                {classItem.grade}
                              </p>
                            </div>

                          </div>

                          <button
                            onClick={() =>
                              handleDeleteClass(
                                classItem._id
                              )
                            }
                            className="p-2 text-gray-500 hover:text-red-500 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
                          >
                            <Trash2 size={18} />
                          </button>

                        </div>

                        {/* Teacher */}
                        <div className="flex items-center gap-3 bg-gray-900 rounded-lg p-3 mb-3">

                          <UserRound
                            size={19}
                            className="text-blue-500"
                          />

                          <div>
                            <p className="text-xs text-gray-500">
                              Teacher
                            </p>

                            <p className="text-sm text-white">
                              {classItem.teacher?.name}
                            </p>
                          </div>

                        </div>

                        {/* Students */}
                        <div className="flex items-center gap-3 bg-gray-900 rounded-lg p-3">

                          <Users
                            size={19}
                            className="text-purple-500"
                          />

                          <div>
                            <p className="text-xs text-gray-500">
                              Students
                            </p>

                            <p className="text-sm text-white">
                              {
                                classItem.students
                                  ?.length || 0
                              }{" "}
                              {classItem.students
                                ?.length === 1
                                ? "student"
                                : "students"}
                            </p>
                          </div>

                        </div>

                      </div>
                    )
                  )}

                </div>
              )}

            </div>

          </div>

        </div>

      </div>
    </div>
  );
}

export default ClassManagement;