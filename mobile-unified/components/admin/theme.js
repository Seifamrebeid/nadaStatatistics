// Shared design tokens for mobile-admin. Aligned with the web brand (emerald).

export const colors = {
  // Brand (emerald)
  brand50:  "#ecfdf5",
  brand100: "#d1fae5",
  brand200: "#a7f3d0",
  brand500: "#10b981",
  brand600: "#059669",
  brand700: "#047857",

  // Slate (neutral)
  slate50:  "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  slate700: "#334155",
  slate800: "#1e293b",
  slate900: "#0f172a",

  // Surfaces
  bg: "#f8fafc",
  card: "#ffffff",
  border: "#e2e8f0",

  // Status
  success: "#10b981",
  warning: "#f59e0b",
  danger:  "#ef4444",
  info:    "#3b82f6",

  white: "#ffffff",
};

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const shadow = {
  card: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  raised: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
};

export const fonts = {
  bodySize: 14,
  titleSize: 22,
  smallSize: 12,
};
