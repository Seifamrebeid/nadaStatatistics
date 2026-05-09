import axios from "axios";
import { auth } from "../firebase";

const isLocalhost =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);

const baseURL =
  import.meta.env.VITE_API_URL || (isLocalhost ? "http://127.0.0.1:8000" : "");
const api = axios.create({ baseURL });

// Attach the current Firebase ID token on every request. The backend's
// auth filter decodes it (emulator: alg=none, prod: verified signature).
api.interceptors.request.use(async (config) => {
  const token = await auth.currentUser?.getIdToken?.();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
