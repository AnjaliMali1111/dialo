# Dialo - 1-on-1 Real-Time Chat, Voice & Video Web Application

**Dialo** is a modern, responsive web application for real-time one-to-one text messaging, voice calling, and video calling.

---

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide React icons, native WebRTC (`RTCPeerConnection`), Web Audio API.
- **Backend**: Node.js, Express, MongoDB (Mongoose), Socket.IO (for real-time messaging and WebRTC signaling), JWT (`jsonwebtoken`).
- **Database**: MongoDB for user profiles, OTP verification, conversation metadata, and message persistence.

---

## Features

1. **Phone Number + OTP Authentication (with JWT)**
   - Enter phone number (+ optional name).
   - Mock/dev OTP is generated and printed in the terminal console and returned in response (`devOtp`) with a 1-click auto-fill button.
   - On verification, creates user (if new) and issues a secure signed JWT session token saved in `localStorage`.
   - Built-in quick demo buttons for **Alice** (`+1000000001`) and **Bob** (`+1000000002`).

2. **Conversation Management & Contact Search**
   - Search registered users by phone number.
   - Start 1-on-1 conversations.
   - Lists ongoing conversations with peer name/phone, last message preview, and timestamp.

3. **Real-Time Text Chat**
   - Clean message bubbles (sent vs received).
   - Instant real-time message exchange via Socket.IO.
   - Persistent message history saved in MongoDB and retrieved on reopening a conversation.

4. **Voice Calling (WebRTC + Socket.IO)**
   - Header button to initiate low-latency peer-to-peer audio call.
   - Ringing tone generated via Web Audio API.
   - Incoming call dialog with Accept / Decline.
   - In-call controls: Mute/Unmute microphone, call duration counter, End Call.

5. **Video Calling (WebRTC + Socket.IO)**
   - Header button to initiate HD video call.
   - Remote full video display with picture-in-picture local camera preview.
   - In-call controls: Mute/Unmute microphone, Camera on/off, call duration counter, End Call.

---

## Project Structure

```
webrtc-chat-app/
├── server/
│   ├── src/
│   │   ├── models.js          # Mongoose schemas (User, Otp, Conversation, Message)
│   │   ├── middleware.js      # JWT authentication middleware
│   │   ├── authRoutes.js      # Auth, search, conversation, and message endpoints
│   │   └── server.js          # Express server & Socket.IO real-time/WebRTC signaling
│   └── test/
│       ├── test-backend.js    # API verification test suite
│       └── test-socket.js     # Real-time chat & signaling test suite
└── client/
    ├── src/
    │   ├── components/
    │   │   ├── AuthScreen.jsx        # Phone + OTP login & demo presets
    │   │   ├── ConversationList.jsx  # Sidebar & user search modal
    │   │   ├── ChatArea.jsx          # Message stream & call trigger buttons
    │   │   └── CallModal.jsx         # WebRTC Voice & Video call overlay
    │   ├── services/
    │   │   ├── api.js                # Authenticated REST API client
    │   │   └── socket.js             # Socket.IO connection
    │   ├── App.jsx                   # Root application state & handlers
    │   └── index.css                 # Tailwind CSS & custom styling
    └── index.html
```

---

## How to Run

### Environment Configuration

The project uses one root `.env` file for both the client and server. It configures the port, MongoDB connection, JWT signing secret, and backend URL through `VITE_SERVER_URL`.

For local development, the defaults are already configured. Change `MONGODB_URI` for a remote MongoDB instance and replace `JWT_SECRET` with a long random value before deployment.

### 1. Ensure MongoDB is Running
Make sure MongoDB is running on `mongodb://127.0.0.1:27017` (the default port).

### 2. Start the Server
```bash
cd server
npm start
```
*Backend runs on `http://localhost:5000`.*

### 3. Start the Client
```bash
cd client
npm run dev
```
*Frontend runs on `http://localhost:5173`.*

---

## How to Test 1-on-1 Chat and Calling

1. Open `http://localhost:5173` in your browser.
2. In **Tab 1**: Click the **"👤 Alice (+1000...01)"** button, click Continue, then click "Auto-fill" and "Verify & Log In".
3. Open an **Incognito window** or **Tab 2** at `http://localhost:5173`.
4. In **Tab 2**: Click the **"👤 Bob (+1000...02)"** button, click Continue, then click "Auto-fill" and "Verify & Log In".
5. **Start Chat**:
   - In Tab 1, click **"New Chat by Phone"**, enter `+1000000002` (or click Chat next to Bob).
   - Send a message: "Hey Bob!". Observe instant delivery on Tab 2.
6. **Voice Call**:
   - Click the **"Voice Call"** button in Tab 1.
   - Tab 2 rings with incoming call prompt from Alice.
   - Click **"Accept"** in Tab 2 to establish peer-to-peer audio.
   - Test mute/unmute and click **"End"**.
7. **Video Call**:
   - Click the **"Video Call"** button in Tab 2.
   - Tab 1 receives incoming video call prompt.
   - Click **"Accept"** to establish peer-to-peer video streams with camera and mic controls.
