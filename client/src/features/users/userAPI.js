//User, auth, class, AI and video-interaction API.
//Uses the shared Axios client, so the JWT and error messages are
//handled by interceptors (see apiClient.js).

import apiClient from "../../shared/api/apiClient";

//build the optional classroom/role filter params
const filterParams = (classroom, role) => ({
  ...(classroom ? { classroom } : {}),
  ...(role ? { role } : {})
});

//users
export const getUsers = async (
  page = 1,
  limit = 5,
  classroom = "",
  role = ""
) => {
  const { data } = await apiClient.get("/users", {
    params: {
      page,
      limit,
      ...filterParams(classroom, role)
    }
  });

  return data;
};

export const searchUsers = async (
  term = "",
  page = 1,
  limit = 5,
  classroom = "",
  role = ""
) => {
  const { data } = await apiClient.get(
    `/users/search/${encodeURIComponent(term)}`,
    {
      params: {
        page,
        limit,
        ...filterParams(classroom, role)
      }
    }
  );

  return data;
};

export const getStats = async () => {
  const { data } = await apiClient.get(
    "/users/status"
  );

  return data;
};

export const getFilterOptions = async () => {
  const { data } = await apiClient.get(
    "/users/filter/options"
  );

  return data;
};

//every teacher, for class assignment
export const getTeachers = async () => {
  const { data } = await apiClient.get(
    "/users/teachers"
  );

  return data;
};

//students ranked by XP within the requester's grade level
export const getLeaderboard = async () => {
  const { data } = await apiClient.get(
    "/users/leaderboard"
  );

  return data.leaderboard || [];
};

//create / update / delete users
export const addUser = async (userData) => {
  const { data } = await apiClient.post(
    "/users",
    userData
  );

  return data;
};

export const updateUser = async (id, userData) => {
  const { data } = await apiClient.put(
    `/users/${id}`,
    userData
  );

  return data;
};

export const deleteUser = async (id) => {
  const { data } = await apiClient.delete(
    `/users/${id}`
  );

  return data;
};

//grades
export const updateGrades = async (id, grades) => {
  const { data } = await apiClient.put(
    `/users/${id}/grades`,
    grades
  );

  return data;
};

//classes
export const createClass = async (classData) => {
  const { data } = await apiClient.post(
    "/users/classes",
    classData
  );

  return data;
};

export const fetchClasses = async () => {
  const { data } = await apiClient.get(
    "/users/classes"
  );

  return data;
};

export const removeClass = async (id) => {
  const { data } = await apiClient.delete(
    `/users/classes/${id}`
  );

  return data;
};

//auth
export const loginUser = async (credentials) => {
  const { data } = await apiClient.post(
    "/users/login",
    credentials
  );

  return data;
};

//ends the session server-side: the login cookie is httpOnly, so only
//the server can clear it
export const logoutUser = async () => {
  const { data } = await apiClient.post(
    "/users/logout"
  );

  return data;
};

export const getCurrentUser = async () => {
  const { data } = await apiClient.get("/users/me");

  return data;
};

//student AI chat
export const sendStudentAIMessage = async (message) => {
  const { data } = await apiClient.post(
    "/ai/student-chat",
    { message }
  );

  return data;
};

//video interactions
export const trackVideoInteraction = async (
  interactionData
) => {
  const { data } = await apiClient.post(
    "/video-interactions",
    interactionData
  );

  return data;
};

export const updateVideoDuration = async (
  interactionId,
  durationSeconds
) => {
  const { data } = await apiClient.put(
    `/video-interactions/${interactionId}/duration`,
    { durationSeconds }
  );

  return data;
};
