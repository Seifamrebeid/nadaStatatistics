# Mobile Admin (React Native + Expo)

Admin mobile app for NadaStatistics built with React Native and Expo.

## Setup

1. **Install dependencies:**

   ```bash
   cd mobile-admin
   npm install
   ```

2. **Set environment variables:**
   - Edit `.env.local` with your Firebase project ID and API URL

3. **Start the development server:**

   ```bash
   npm run dev
   # or
   npm start
   ```

4. **Choose platform:**
   - Press `i` for iOS simulator
   - Press `a` for Android emulator
   - Press `w` for web preview

## Features

- Admin login via Firebase Authentication
- Dashboard with API health status
- Student management (list, create, view details)
- Doctor management (scaffold)
- Admin management (scaffold)
- Lecture management (scaffold)

## Requirements

- Node.js 16+
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator (macOS) or Android Emulator
- Firebase emulator running on localhost:9099, 8080, 9199

## API Integration

Endpoints are defined in `firebase.js` and connected to:

- Auth: `http://127.0.0.1:9099`
- Firestore: `http://127.0.0.1:8080`
- Storage: `http://127.0.0.1:9199`
- API: `http://127.0.0.1:8000` (R Plumber backend)

## Build for Production

```bash
npm run prebuild
npm run build:ios    # iOS
npm run build:android # Android
```
