const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

// ✅ Allow only your frontend on Vercel
app.use(cors({ origin: "https://polling-frontend.vercel.app" }));

// ✅ Health check route
app.get("/", (req, res) => {
  res.send("✅ Polling Backend is live on Render!");
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://polling-frontend.vercel.app", // your hosted frontend URL
    methods: ["GET", "POST"],
  },
});

// === State ===
let students = new Set();
let currentQuestion = null;
let studentAnswers = {};
let questionTimer = null;

// === Socket events ===
io.on("connection", (socket) => {
  console.log("🔗 New connection:", socket.id);

  // Teacher joins
  socket.on("teacher-join", () => {
    socket.data.role = "teacher";
    console.log("📘 Teacher joined");
  });

  // Student joins
  socket.on("student-join", (studentName) => {
    socket.data.role = "student";
    socket.data.name = studentName;

    students.add(studentName);
    io.emit("student-list", Array.from(students));
  });

  // Teacher asks a question
  socket.on("create-question", (q) => {
    if (currentQuestion) return; // ignore if one is active

    currentQuestion = q;
    studentAnswers = {};
    io.emit("new-question", currentQuestion);

    const pollTime = q.timer ? q.timer * 1000 : 60000; // ✅ safe fallback (60s)
    questionTimer = setTimeout(() => {
      io.emit("show-results", studentAnswers);
      currentQuestion = null;
      studentAnswers = {};
    }, pollTime);
  });

  // Student submits answer
  socket.on("submit-answer", (ans) => {
    if (!currentQuestion) return;

    studentAnswers[socket.data.name] = ans;
    io.emit("live-update", studentAnswers);

    // If all students answered
    if (Object.keys(studentAnswers).length >= students.size) {
      clearTimeout(questionTimer);
      io.emit("show-results", studentAnswers);
      currentQuestion = null;
      studentAnswers = {};
    }
  });

  // Teacher removes a student
  socket.on("kick-student", (studentName) => {
    students.delete(studentName);
    io.emit("student-list", Array.from(students));

    // ✅ Notify the kicked student only
    for (let [id, client] of io.sockets.sockets) {
      if (client.data.name === studentName) {
        client.emit("kicked");
        client.disconnect(true);
        break;
      }
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    if (socket.data.role === "student") {
      students.delete(socket.data.name);
      io.emit("student-list", Array.from(students));
    }
    console.log("❌ Disconnected:", socket.id);
  });
});

// ✅ Start server
server.listen(4000, () => {
  console.log("🚀 Backend running at http://localhost:4000");
});