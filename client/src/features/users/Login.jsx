import { useRef, useState } from "react";
import { loginUser } from "./userAPI";
import { readFormValues } from "../../shared/form/readFormValues";

//The credentials are read off the form when it is submitted rather than
//mirrored in state, so typing a password does not re-render the page on
//every keystroke.
function Login({ onLogin }) {
  const formRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const data = await loginUser(
        readFormValues(formRef.current)
      );

      //save user information
      localStorage.setItem(
        "loggedInUser",
        JSON.stringify(data.user)
      );

      onLogin(data.user);

    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">

      <form
        ref={formRef}
        onSubmit={handleLogin}
        className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-lg shadow-xl p-8"
      >

        <h1 className="text-2xl font-bold text-white mb-2">
          Login
        </h1>

        <p className="text-gray-400 mb-6">
          Login to User Management
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500 text-red-400 rounded-lg">
            {error}
          </div>
        )}

        {/* Email */}
        <div className="mb-4">
          <label className="block text-gray-300 font-medium mb-2">
            Email
          </label>

          <input
            name="email"
            type="email"
            defaultValue=""
            className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
            placeholder="admin@gmail.com"
            required
          />
        </div>

        {/* Password */}
        <div className="mb-6">
          <label className="block text-gray-300 font-medium mb-2">
            Password
          </label>

          <input
            name="password"
            type="password"
            defaultValue=""
            className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
            placeholder="Enter password"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2.5 bg-green-500 hover:bg-green-400 text-gray-950 font-semibold rounded-lg disabled:opacity-50"
        >
          {loading ? "Logging in..." : "Login"}
        </button>

      </form>
    </div>
  );
}


export default Login;
