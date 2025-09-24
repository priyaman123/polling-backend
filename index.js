const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

/**
 * ✅ CORS Settings
 * - Allow your deployed frontend (Vercel)
 * - Allow localhost:3000 for local testing
 */
app.use(
  cors({
    origin: [
      "http://localhost:3000",                  // local development
      "https://polling-frontend-sepia.vercel.app", // ✅ your actual Vercel frontend link
    ],
    methods: ["GET", "POST"],
  })
);

// ✅ Health check route - easy Render testing in browser
app.get("/", (req, res) => {
  res.send("✅ Polling Backend is live on Render 🚀");
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://polling-frontend-sepia.vercel.app",
    ],
    methods: ["GET", "POST"],
  },
});

// ===== In-Memory State =====
let students = new Set();
let currentQuestion = null;
let studentAnswers = {};
let questionTimer = null;

// ===== Socket Events =====
io.on("connection", (socket) => {
  console.log("🔗 New client connected:", socket.id);

  // Teacher joins
  socket.on("teacher-join", () => {
    socket.data.role = "teacher";
    console.log("📘 Teacher joined:", socket.id);
  });

  // Student joins
  socket.on("student-join", (studentName) => {
    socket.data.role = "student";
    socket.data.name = studentName;

    students.add(studentName);
    console.log(`👨‍🎓 Student joined: ${studentName}`);
    io.emit("student-list", Array.from(students));
  });

  // Teacher creates a question
  socket.on("create-question", (q) => {
    if (currentQuestion) {
      console.log("⚠️ Question already active, ignoring.");
      return; // Prevent overriding current active question
    }

    currentQuestion = q;
    studentAnswers = {};
    console.log("❓ New Question Asked:", q.question);

    io.emit("new-question", currentQuestion);

    // ✅ Safe timer fallback
    const pollTime = q.timer ? q.timer * 1000 : 60000;
    questionTimer = setTimeout(() => {
      console.log("⏰ Poll timed out, showing results.");
      io.emit("show-results", studentAnswers);
      currentQuestion = null;
      studentAnswers = {};
    }, pollTime);
  });

  // Student submits answer
  socket.on("submit-answer", (ans) => {
    if (!currentQuestion) return;

    studentAnswers[socket.data.name] = ans;
    console.log(`📝 Answer from ${socket.data.name}: ${ans}`);

    io.emit("live-update", studentAnswers);

    // ✅ End poll early if all students answered
    if (Object.keys(studentAnswers).length >= students.size) {
      clearTimeout(questionTimer);
      console.log("✅ All students answered, showing results early.");
      io.emit("show-results", studentAnswers);
      currentQuestion = null;
      studentAnswers = {};
    }
  });

  // Teacher kicks a student
  socket.on("kick-student", (studentName) => {
    students.delete(studentName);
    io.emit("student-list", Array.from(students));

    for (let [id, client] of io.sockets.sockets) {
      if (client.data.name === studentName) {
        console.log(`⛔ Student kicked: ${studentName}`);
        client.emit("kicked");
        client.disconnect(true);
        break;
      }
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    if (socket.data.role === "student") {
      students.delete(socket.data.name);
      io.emit("student-list", Array.from(students));
      console.log(`👋 Student disconnected: ${socket.data.name}`);
    }
    console.log("❌ Socket closed:", socket.id);
  });
});

// ===== Start Server =====
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});