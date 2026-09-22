//Single Axios instance shared by every API module, so auth and error
//handling live in exactly one place.

import axios from "axios";

//Empty keeps requests on the same origin so the Vite dev proxy
//handles them (see vite.config.js).
const API_BASE = import.meta.env.VITE_API_URL ?? "";

const apiClient = axios.create({
  baseURL: `${API_BASE}/api/v1`,

  //The session lives in an httpOnly cookie, so the browser has to send it
  //for us: JavaScript cannot read the token and cannot set the header by
  //hand. This is also what makes a cross-origin API (VITE_API_URL on
  //another host) receive the cookie.
  withCredentials: true
});

//turn failed responses into Errors carrying the server message,
//so callers can keep using error.message
apiClient.interceptors.response.use(
  (response) => response,

  (error) => {
    const data = error.response?.data;

    const message =
      data?.message ||
      data?.error ||
      error.message ||
      "Something went wrong";

    return Promise.reject(new Error(message));
  }
);

export default apiClient;
