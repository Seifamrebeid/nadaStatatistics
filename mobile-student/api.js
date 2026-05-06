import axios from "axios";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "./firebase";

export const APP_ROLE = "student";
export const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:8000";

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(async (config) => {
  const token = await auth.currentUser?.getIdToken?.();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const unwrap = (response) => response.data;

export const normalize = (row) => {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    out[key] = Array.isArray(value) ? value[0] : value;
  }
  return out;
};

export const getHealth = () => api.get("/health").then(unwrap);
export const getMe = () => api.get("/api/me").then(unwrap);
export const getLectures = () => api.get("/api/lectures").then((res) => res.data || []);
export const getEmotions = (params = {}) =>
  api.get("/api/emotions", { params }).then((res) => res.data || []);
export const getStudentComparison = (id) =>
  api.get(`/api/analytics/student/${id}/comparison`).then(unwrap);

export const faceLogin = async (photo) => {
  const formData = new FormData();
  formData.append("role", APP_ROLE);
  formData.append("file", {
    uri: photo.uri,
    name: "face.jpg",
    type: "image/jpeg",
  });

  const response = await fetch(`${API_URL}/api/auth/face-login`, {
    method: "POST",
    body: formData,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      const best = data?.best_distance;
      const suffix = best ? ` Best distance: ${best}.` : "";
      throw new Error(
        `No enrolled student face matched this photo.${suffix} Make sure the admin uploaded a clean face photo for this student.`,
      );
    }
    throw new Error(data?.error || data?.message || `Face sign-in failed with ${response.status}`);
  }

  const token = Array.isArray(data.custom_token)
    ? data.custom_token[0]
    : data.custom_token || data.token;
  if (!token) throw new Error("Face sign-in did not return a Firebase token.");
  await signInWithCustomToken(auth, token);
  return data;
};

export default api;
