import {
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  GraduationCap
} from "lucide-react";
function UserTable({
  users = [],
  currentPage,
  totalPages,
  onGrade,
  onEdit,
  onChange,
  onDelete,
  canGrade,
  canManage
}) {
  return (
    <div className="w-full max-w-full bg-gray-900 rounded-lg overflow-hidden border border-gray-800">

      {/* Cho phép bảng cuộn ngang thay vì bị cắt */}
      <div className="w-full overflow-x-auto">

        <table className="w-full min-w-[1250px] text-left border-collapse">

          {/* Table Header */}
          <thead className="bg-gray-800 border-b border-gray-700">
            <tr>
              <th className="px-4 py-4 text-left text-sm font-semibold text-gray-300 whitespace-nowrap">
                <h2 className="text-lg font-bold">
                  Name
                </h2>
              </th>

              <th className="px-4 py-4 text-left text-sm font-semibold text-gray-300 whitespace-nowrap">
                Email
              </th>

              <th className="px-4 py-4 text-left text-sm font-semibold text-gray-300 whitespace-nowrap">
                Phone
              </th>

              <th className="px-4 py-4 text-left text-sm font-semibold text-gray-300 whitespace-nowrap">
                Classroom
              </th>

              <th className="px-4 py-4 text-left text-sm font-semibold text-gray-300 whitespace-nowrap">
                Role
              </th>

              <th className="px-4 py-4 text-left text-sm font-semibold text-gray-300 whitespace-nowrap">
                Status
              </th>

              <th className="px-4 py-4 text-left text-sm font-semibold text-gray-300 whitespace-nowrap">
                Created
              </th>

              <th className="min-w-[290px] px-4 py-4 text-center text-sm font-semibold text-gray-300 whitespace-nowrap">
                Action
              </th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-gray-800">

            {users.map((u) => (
              <tr
                key={u._id}
                className="hover:bg-gray-800/50 transition-colors"
              >

                <td className="px-4 py-4 text-sm text-white font-medium">
                  {u.name}
                </td>

                <td className="px-4 py-4 text-sm text-white font-medium whitespace-nowrap">
                  {u.email}
                </td>

                <td className="px-4 py-4 text-sm text-white font-medium whitespace-nowrap">
                  {u.phone}
                </td>

                <td className="px-4 py-4 text-sm text-white font-medium whitespace-nowrap">
                  {u.classroom}
                </td>

                <td className="px-4 py-4 text-sm text-white font-medium capitalize whitespace-nowrap">
                  {u.role}
                </td>

                <td className="px-4 py-4 text-sm whitespace-nowrap">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      u.status === "active" ||
                      u.status === "Active"
                        ? "bg-green-500 text-gray-900"
                        : "bg-red-500 text-white"
                    }`}
                  >
                    {u.status}
                  </span>
                </td>

                <td className="px-4 py-4 text-sm text-gray-400 whitespace-nowrap">
                  {new Date(
                    u.createdAt
                  ).toLocaleDateString()}
                </td>

                {/* Action Buttons */}
                <td className="min-w-[290px] px-4 py-4 text-center">
                  <div className="flex flex-nowrap items-center justify-center gap-2 whitespace-nowrap">

                    {/* Grade Button */}
                    {canGrade &&
                      u.role === "student" && (
                        <button
                          onClick={() => onGrade(u)}
                          className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all font-semibold cursor-pointer"
                        >
                          <GraduationCap size={16} />
                          Grade
                        </button>
                      )}

                    {/* Edit Button */}
                    {canManage && (
                      <button
                        onClick={() => onEdit(u)}
                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-sm bg-green-500 text-gray-900 rounded-lg hover:bg-green-400 transition-all font-semibold cursor-pointer"
                      >
                        <Edit size={16} />
                        Edit
                      </button>
                    )}

                    {/* Delete Button */}
                    {canManage && (
                      <button
                        onClick={() =>
                          onDelete(u._id)
                        }
                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all font-semibold cursor-pointer"
                      >
                        <Trash2 size={16} />
                        Delete
                      </button>
                    )}

                    {/* No available actions */}
                    {!canManage &&
                      !(
                        canGrade &&
                        u.role === "student"
                      ) && (
                        <span className="text-gray-500">
                          —
                        </span>
                      )}

                  </div>
                </td>

              </tr>
            ))}

            {/* No users found */}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="text-center py-12 text-gray-400"
                >
                  No users found
                </td>
              </tr>
            )}

          </tbody>
        </table>

      </div>

      {/* Pagination */}
      <div className="px-4 sm:px-6 py-4 border-t border-gray-800 flex flex-wrap gap-4 justify-between items-center bg-gray-800">

        <div className="text-sm text-gray-400 whitespace-nowrap">
          Page {currentPage} of {totalPages}
        </div>

        <div className="flex flex-wrap gap-2">

          {/* Previous Button */}
          <button
            className="flex items-center gap-1 px-3 py-2 bg-gray-700 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={
              currentPage === 1 ||
              totalPages === 0
            }
            onClick={() =>
              onChange(currentPage - 1)
            }
          >
            <ChevronLeft size={16} />
            Prev
          </button>

          {/* Page Number Buttons */}
          {[...Array(Math.max(0, totalPages))].map(
            (_, i) => {
              const page = i + 1;

              if (
                page === 1 ||
                page === totalPages ||
                (
                  page >= currentPage - 1 &&
                  page <= currentPage + 1
                )
              ) {
                return (
                  <button
                    key={page}
                    className={`px-3 py-2 rounded-lg ${
                      currentPage === page
                        ? "bg-green-500 text-gray-900 font-semibold"
                        : "bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600"
                    }`}
                    onClick={() =>
                      onChange(page)
                    }
                  >
                    {page}
                  </button>
                );
              }

              return null;
            }
          )}

          {/* Next Button */}
          <button
            className="flex items-center gap-1 px-3 py-2 bg-gray-700 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={
              currentPage === totalPages ||
              totalPages === 0
            }
            onClick={() =>
              onChange(currentPage + 1)
            }
          >
            Next
            <ChevronRight size={16} />
          </button>

        </div>
      </div>

    </div>
  );
}

export default UserTable;