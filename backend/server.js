import express from "express";
import cors from "cors";
import pkg from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const { Pool } = pkg;
const app = express();
const PORT = 3000;
const JWT_SECRET = "your_super_secret_key";

// Middleware
app.use(cors());
app.use(express.json()); // replaced bodyParser

// PostgreSQL Connection
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "expensesplit",
  password: "1234",
  port: 5433,
});

// Auth Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token missing" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Token invalid" });
    }
    req.user = user;
    next();
  });
}

// Signup
app.post("/api/signup", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: "Username and password required" });

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO users (username, password) VALUES ($1, $2)", [username, hash]);
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "1h" });
    res.json({ success: true, username, token });
  } catch (err) {
    console.error("Signup Error:", err.message);
    res.status(500).json({ success: false, message: "Signup failed" });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "1h" });
    res.json({ success: true, username, token });
  } catch (err) {
    console.error("Login Error:", err.message);
    res.status(500).json({ success: false, message: "Login failed" });
  }
});

// Create Room
app.post("/api/rooms", authenticateToken, async (req, res) => {
  const { room_name } = req.body;
  const created_by = req.user.username;

  if (!room_name)
    return res.status(400).json({ message: "Room name is required" });

  try {
    const result = await pool.query(
      "INSERT INTO rooms (name, created_by) VALUES ($1, $2) RETURNING id",
      [room_name, created_by]
    );
    res.json({ success: true, roomId: result.rows[0].id, room_name });
  } catch (err) {
    console.error("Create Room Error:", err.message);
    res.status(500).json({ message: "Failed to create room" });
  }
});

// Join Room
app.post("/api/join-room", authenticateToken, async (req, res) => {
  const { room_id } = req.body;
  const username = req.user.username;

  try {
    const exists = await pool.query("SELECT * FROM rooms WHERE id = $1", [room_id]);
    if (exists.rowCount === 0)
      return res.status(404).json({ success: false, message: "Room not found" });

    await pool.query(
      "INSERT INTO participants (room_id, username) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [room_id, username]
    );
    res.json({ success: true, message: "Joined room successfully" });
  } catch (err) {
    console.error("Join Room Error:", err.message);
    res.status(500).json({ success: false, message: "Failed to join room" });
  }
});

// Add Expense to Room
app.post("/api/room/:roomId/expense", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const { desc, amount, people } = req.body;
  const username = req.user.username;

  if (!desc || !amount || !people)
    return res.status(400).json({ message: "All fields are required" });

  try {
    await pool.query(
      "INSERT INTO room_expenses (room_id, username, description, amount, people, created_at) VALUES ($1, $2, $3, $4, $5, NOW())",
      [roomId, username, desc, amount, people]
    );
    res.json({ success: true, message: "Room expense added" });
  } catch (err) {
    console.error("Add Room Expense Error:", err.message);
    res.status(500).json({ success: false, message: "Failed to add room expense" });
  }
});

// Get Room Expense History
app.get("/api/room/:roomId/history", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM room_expenses WHERE room_id = $1 ORDER BY created_at DESC",
      [roomId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch Room History Error:", err.message);
    res.status(500).json({ success: false, message: "Failed to fetch room history" });
  }
});

// Personal Expense
app.post("/api/expense", authenticateToken, async (req, res) => {
  const { desc, amount, people } = req.body;
  const username = req.user.username;

  if (!desc || !amount || !people)
    return res.status(400).json({ success: false, message: "All fields are required" });

  try {
    await pool.query(
      "INSERT INTO expenses (username, description, amount, people, created_at) VALUES ($1, $2, $3, $4, NOW())",
      [username, desc, amount, people]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Add Personal Expense Error:", err.message);
    res.status(500).json({ success: false });
  }
});

// Personal History
app.get("/api/history", authenticateToken, async (req, res) => {
  const username = req.user.username;
  try {
    const result = await pool.query(
      "SELECT * FROM expenses WHERE username = $1 ORDER BY created_at DESC",
      [username]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch Personal History Error:", err.message);
    res.status(500).json({ success: false });
  }
});

// Root
app.get("/", (req, res) => res.send("Server is running"));
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
