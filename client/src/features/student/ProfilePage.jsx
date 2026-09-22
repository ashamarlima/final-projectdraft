import {
    Mail,
    School,
    User
} from "lucide-react";


function ProfilePage({
    student
}) {
    return (
        <div className="space-y-6">

            <div>

                <h1 className="text-2xl font-bold text-gray-900">
                    Profile
                </h1>

                <p className="text-sm text-gray-500 mt-1">
                    View your student information.
                </p>

            </div>


            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">

                <div className="flex flex-col sm:flex-row sm:items-center gap-5">

                    <div className="w-20 h-20 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">

                        <User
                            size={34}
                        />

                    </div>


                    <div>

                        <h2 className="text-xl font-bold text-gray-900">
                            {
                                student?.name ||
                                "Student"
                            }
                        </h2>

                        <p className="text-sm text-gray-500 mt-1 capitalize">
                            {
                                student?.role ||
                                "student"
                            }
                        </p>

                    </div>

                </div>


                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">

                    <div className="p-4 rounded-xl bg-gray-50">

                        <div className="flex items-center gap-2 text-gray-500 text-sm">

                            <Mail
                                size={16}
                            />

                            Email

                        </div>

                        <p className="text-sm font-medium text-gray-900 mt-2 break-all">
                            {
                                student?.email ||
                                "No email available"
                            }
                        </p>

                    </div>


                    <div className="p-4 rounded-xl bg-gray-50">

                        <div className="flex items-center gap-2 text-gray-500 text-sm">

                            <School
                                size={16}
                            />

                            Classroom

                        </div>

                        <p className="text-sm font-medium text-gray-900 mt-2">
                            {
                                student?.classroom ||
                                "Not assigned"
                            }
                        </p>

                    </div>

                </div>

            </div>

        </div>
    );
}


export default ProfilePage;