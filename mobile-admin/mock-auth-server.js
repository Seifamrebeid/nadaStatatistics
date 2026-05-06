const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

// Mock user accounts with test credentials
const MOCK_USERS = {
  "admin@nada.local": {
    password: "Admin123!",
    uid: "admin-uid-12345",
    email: "admin@nada.local",
    displayName: "Admin User",
    emailVerified: true,
  },
  "test@test.com": {
    password: "123456789",
    uid: "test-uid-67890",
    email: "test@test.com",
    displayName: "Test User",
    emailVerified: false,
  },
};

// Store active sessions
const MOCK_SESSIONS = new Map();

// Generate a mock ID token
function generateMockToken(uid, email) {
  // Simple base64 mock token (not a real JWT for testing purposes only)
  const header = Buffer.from(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT",
      kid: "test-key",
    }),
  ).toString("base64");

  const payload = Buffer.from(
    JSON.stringify({
      iss: "http://127.0.0.1:9099",
      aud: "nada-stats-dev",
      auth_time: Math.floor(Date.now() / 1000),
      user_id: uid,
      sub: uid,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: email,
      email_verified: true,
      firebase: {
        identities: {
          email: [email],
        },
        sign_in_provider: "password",
      },
    }),
  ).toString("base64");

  const signature = Buffer.from("mock-signature").toString("base64");
  return `${header}.${payload}.${signature}`;
}

// Mock Firebase Auth endpoint: Sign in with email and password
app.post("/v1/accounts:signInWithPassword", (req, res) => {
  const { email, password, returnSecureToken } = req.body;

  const user = MOCK_USERS[email];
  if (!user || user.password !== password) {
    return res.status(400).json({
      error: {
        code: "INVALID_PASSWORD",
        message:
          "The password is invalid or the user does not have a password.",
      },
    });
  }

  const idToken = generateMockToken(user.uid, user.email);

  res.json({
    kind: "identitytoolkit#VerifyPasswordResponse",
    localId: user.uid,
    email: user.email,
    displayName: user.displayName,
    idToken: idToken,
    registered: true,
    refreshToken: `refresh_${user.uid}_${Date.now()}`,
    expiresIn: 3600,
  });
});

// Mock Firebase Auth endpoint: Get user info
app.post("/v1/accounts:lookup", (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({
      error: {
        code: "MISSING_ID_TOKEN",
        message: "Missing ID token.",
      },
    });
  }

  // Find user by parsing the mock token
  let foundUser = null;
  for (const user of Object.values(MOCK_USERS)) {
    if (idToken.includes(user.uid)) {
      foundUser = user;
      break;
    }
  }

  if (!foundUser) {
    return res.status(400).json({
      error: {
        code: "INVALID_ID_TOKEN",
        message: "The ID token is invalid.",
      },
    });
  }

  res.json({
    kind: "identitytoolkit#GetAccountInfoResponse",
    users: [
      {
        localId: foundUser.uid,
        email: foundUser.email,
        displayName: foundUser.displayName,
        emailVerified: foundUser.emailVerified,
        createdAt: 1234567890000,
        lastLoginAt: Date.now(),
      },
    ],
  });
});

// Mock Firebase Auth endpoint: Refresh token
app.post("/v1/token", (req, res) => {
  const { refresh_token, grant_type } = req.body;

  if (grant_type !== "refresh_token") {
    return res.status(400).json({
      error: "invalid_grant",
    });
  }

  // Extract user ID from refresh token
  const match = refresh_token.match(/refresh_([a-z0-9-]+)_/);
  if (!match) {
    return res.status(400).json({
      error: "invalid_refresh_token",
    });
  }

  const uid = match[1];
  let foundUser = null;
  for (const user of Object.values(MOCK_USERS)) {
    if (user.uid === uid) {
      foundUser = user;
      break;
    }
  }

  if (!foundUser) {
    return res.status(400).json({
      error: "user_not_found",
    });
  }

  const newIdToken = generateMockToken(foundUser.uid, foundUser.email);

  res.json({
    access_token: newIdToken,
    expires_in: 3600,
    token_type: "Bearer",
    id_token: newIdToken,
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "mock-firebase-auth" });
});

const PORT = 9099;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Mock Firebase Auth server running on http://127.0.0.1:${PORT}`);
  console.log(`\nTest Credentials:`);
  console.log(`Email: admin@nada.local`);
  console.log(`Password: Admin123!`);
});
