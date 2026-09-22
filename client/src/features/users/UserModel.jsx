import { useRef } from "react";
import { X, Check } from "lucide-react";
import { readFormValues } from "../../shared/form/readFormValues";

//The inputs are uncontrolled on purpose: their values are read once, when
//the form is submitted, so typing here never pushes an update into the
//parent that owns the user table. The modal is unmounted while closed, so
//`defaultValue` is applied fresh every time it opens, which is what
//prefills the fields when an existing user is being edited.
function UserModel({
  isOpen,
  closeModel,
  item = null,
  onSubmit,
  loading,
  status,
  classrooms = []
}) {
  const formRef = useRef(null);

  if (!isOpen) return null;

  const isEditing = Boolean(item?._id);

  const handleFormSubmit = (event) => {
    event.preventDefault();

    onSubmit(readFormValues(formRef.current));
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">

      {/* Modal Container Box */}
      <div className="bg-gray-900 rounded-lg shadow-2xl max-w-2xl w-full max-h-screen overflow-y-auto border border-gray-800">

        {/* Header Section */}
        <div className="flex justify-between items-center p-6 border-b border-gray-800">
          <h2 className="text-2xl font-bold text-white">{isEditing ? "Edit User" : "Add New User"}</h2>
          <button type="button" onClick={closeModel} className="text-gray-400 hover:text-white hover:bg-gray-800 p-1 rounded-full transition-all cursor-pointer">
            <X size={24} />
          </button>
        </div>

        {/* Form Input Section */}
        <form ref={formRef} onSubmit={handleFormSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Input Element: Name */}
            <div>
              <label className="block text-gray-300 font-medium mb-2">Name *</label>
              <input
                name="name"
                type="text"
                defaultValue={item?.name ?? ""}
                placeholder="John Doe"
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              />
            </div>

            {/* Input Element: Email */}
            <div>
              <label className="block text-gray-300 font-medium mb-2">Email *</label>
              <input
                name="email"
                type="email"
                defaultValue={item?.email ?? ""}
                placeholder="john.doe@example.com"
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              />
            </div>

            {/* Input Element: Phone */}
            <div>
              <label className="block text-gray-300 font-medium mb-2">Phone *</label>
              <input
                name="phone"
                type="tel"
                defaultValue={item?.phone ?? ""}
                placeholder="+1234567890"
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              />
            </div>

            {/* Input Element: Password */}
            <div>
              <label className="block text-gray-300 font-medium mb-2">Password {isEditing ? "" : "*"}</label>
              <input
                name="password"
                type="password"
                defaultValue=""
                placeholder={isEditing ? "Leave blank to keep current" : "••••••••"}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              />
            </div>

            {/* Selector Option: Classroom */}
            <div>
              <label className="block text-gray-300 font-medium mb-2">
                Classroom *
              </label>

              <select
                name="classroom"
                defaultValue={item?.classroom ?? "9"}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none cursor-pointer"
              >
                <option value="" disabled>
                  Select classroom
                </option>

                {classrooms.map((classroom) => (
                  <option
                    key={classroom}
                    value={classroom}
                  >
                    Classroom {classroom}
                  </option>
                ))}
              </select>
            </div>

            {/* Selector Option: Role */}
            <div>
              <label className="block text-gray-300 font-medium mb-2">Role *</label>
              <select className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none cursor-pointer"
                name="role"
                defaultValue={item?.role ?? "student"}
              >
                {["student", "teacher", "admin"].map((role) => (
                  <option key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
                ))}
              </select>
            </div>

            {/* Selector Option: Status */}
            <div>
              <label className="block text-gray-300 font-medium mb-2">Status *</label>
              <select className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none cursor-pointer"
                name="status"
                defaultValue={item?.status ?? "active"}
              >
                {status.map((stat) => (
                  <option key={stat} value={stat}>{stat}</option>
                ))}
              </select>
            </div>

          </div>

          {/* Action Control Buttons Layout */}
          <div className="flex gap-3 mt-8">
            {/* Cancel Control */}
            <button type="button" onClick={closeModel} className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 transition-all cursor-pointer font-medium">
              Cancel
            </button>

            {/* Submit Control */}
            <button type="submit" className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-700 bg-green-500 hover:bg-green-400 text-gray-900 rounded-lg transition-all font-semibold cursor-pointer"
              disabled={loading}>
              <Check size={20} />
              {loading ? "Saving..." : isEditing ? "Update User" : "Add User"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

export default UserModel;
