const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

// Health check route
app.get("/", (req, res) => {
  res.send("✅ Polling backend running...");
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// State
let students = new Set();
let currentQuestion = null;
let studentAnswers = {};
let questionTimer = null;

io.on("connection", (socket) => {
  console.log("🔗 New connection:", socket.id);

  socket.on("teacher-join", () => {
    socket.data.role = "teacher";
    console.log("📘 Teacher joined");
  });

  socket.on("student-join", (studentName) => {
    socket.data.role = "student";
    socket.data.name = studentName;
    students.add(studentName);
    io.emit("student-list", Array.from(students));
  });

  socket.on("create-question", (q) => {
    if (currentQuestion) return;
    currentQuestion = q;
    studentAnswers = {};
    io.emit("new-question", currentQuestion);

    // Timeout
    questionTimer = setTimeout(() => {
      io.emit("show-results", studentAnswers);
      currentQuestion = null;
      studentAnswers = {};
    }, q.timer * 1000 || 60000);
  });

  socket.on("submit-answer", (ans) => {
    if (!currentQuestion) return;
    studentAnswers[socket.data.name] = ans;
    io.emit("live-update", studentAnswers);

    if (Object.keys(studentAnswers).length >= students.size) {
      clearTimeout(questionTimer);
      io.emit("show-results", studentAnswers);
      currentQuestion = null;
      studentAnswers = {};
    }
  });

  socket.on("kick-student", (studentName) => {
    io.to(socket.id).emit("kicked", studentName);
    students.delete(studentName);
    io.emit("student-list", Array.from(students));
  });

  socket.on("disconnect", () => {
    if (socket.data.role === "student") {
      students.delete(socket.data.name);
      io.emit("student-list", Array.from(students));
    }
    console.log("❌ Disconnected:", socket.id);
  });
});

server.listen(4000, () => {
  console.log("🚀 Backend running at http://localhost:4000");
});