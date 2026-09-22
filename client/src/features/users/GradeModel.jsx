import { useRef } from "react";
import { X, Check } from "lucide-react";
import { readFormValues } from "../../shared/form/readFormValues";

//Like the user form, the grade fields are uncontrolled and their values
//are read once on submit, so typing a grade does not re-render the user
//table behind the modal. The modal unmounts when it closes, so
//`defaultValue` re-applies (and prefills from the student) on each open.
function GradeModel({
  isOpen,
  closeModel,
  student,
  onSubmit,
  loading
}) {
  const formRef = useRef(null);

  if (!isOpen || !student) return null;

  const subjects = [
    "Math",
    "Literature",
    "Science"
  ];

  const handleFormSubmit = (event) => {
    event.preventDefault();

    onSubmit(readFormValues(formRef.current));
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">

      {/* Modal Container */}
      <div className="bg-gray-900 rounded-lg shadow-2xl max-w-xl w-full border border-gray-800">

        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-800">
          <div>
            <h2 className="text-2xl font-bold text-white">
              Grade Student
            </h2>

            <p className="text-sm text-gray-400 mt-1">
              {student.name} — Classroom {student.classroom}
            </p>
          </div>

          <button
            type="button"
            onClick={closeModel}
            className="text-gray-400 hover:text-white hover:bg-gray-800 p-1 rounded-full transition-all cursor-pointer"
          >
            <X size={24} />
          </button>
        </div>

        {/* Grade Fields */}
        <form ref={formRef} onSubmit={handleFormSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

            {subjects.map((subject) => (
              <div key={subject}>
                <label className="block text-gray-300 font-medium mb-2">
                  {subject}
                </label>

                <input
                  name={subject}
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={student[subject] ?? ""}
                  placeholder="0 - 100"
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
              </div>
            ))}

          </div>

          {/* Buttons */}
          <div className="flex gap-3 mt-8">

            <button
              type="button"
              onClick={closeModel}
              className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 transition-all cursor-pointer font-medium"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-700 bg-green-500 hover:bg-green-400 text-gray-900 rounded-lg transition-all font-semibold cursor-pointer disabled:opacity-50"
            >
              <Check size={20} />

              {loading
                ? "Saving..."
                : "Save Grades"
              }
            </button>

          </div>
        </form>

      </div>
    </div>
  );
}

export default GradeModel;
