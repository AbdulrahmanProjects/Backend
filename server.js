const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3001;
const ADMIN_KEY = process.env.ADMIN_KEY || "admin123";

app.use(cors());
app.use(express.json());

const isAdmin = (req) =>
  req.headers["x-admin-key"] === ADMIN_KEY ||
  req.query.adminKey === ADMIN_KEY;

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "Hotel System backend is running" });
});

app.get("/api/hotels", (req, res) => {
  const admin = isAdmin(req);
  let query = `
    SELECT
      h.id,
      h.name,
      h.location,
      COUNT(r.id) AS totalRooms,
      SUM(CASE WHEN r.status = 'available' THEN 1 ELSE 0 END) AS availableRooms
    FROM hotels h
    LEFT JOIN rooms r ON r.hotel_id = h.id
    GROUP BY h.id
  `;

  if (!admin) {
    query += " HAVING availableRooms > 0";
  }
  query += " ORDER BY h.id";

  db.all(query, (err, rows) => {
    if (err) {
      console.error("Error fetching hotels:", err);
      return res.status(500).json({ error: "Failed to load hotels" });
    }
    res.json(rows);
  });
});

app.get("/api/rooms", (req, res) => {
  const { hotelId } = req.query;
  const admin = isAdmin(req);
  let query = `
    SELECT r.id, r.type, r.price, r.status,
           h.name AS hotelName, h.location, h.id AS hotelId
    FROM rooms r
    JOIN hotels h ON r.hotel_id = h.id
  `;
  const params = [];
  const conditions = [];

  if (hotelId) {
    conditions.push("h.id = ?");
    params.push(Number(hotelId));
  }
  if (!admin) {
    conditions.push("r.status = 'available'");
  }
  if (conditions.length) {
    query += " WHERE " + conditions.join(" AND ");
  }
  query += " ORDER BY r.id";

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error("Error fetching rooms:", err);
      return res.status(500).json({ error: "Failed to load rooms" });
    }
    res.json(rows);
  });
});

app.get("/api/bookings", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Admin access required" });
  }

  const query = `
    SELECT b.id, b.guest_name AS guestName, b.check_in AS checkIn, b.check_out AS checkOut,
           b.activities,
           b.created_at AS createdAt,
           r.id AS roomId, r.type AS roomType,
           h.id AS hotelId, h.name AS hotelName
    FROM bookings b
    JOIN rooms r ON b.room_id = r.id
    JOIN hotels h ON r.hotel_id = h.id
    ORDER BY b.created_at DESC
  `;

  db.all(query, (err, rows) => {
    if (err) {
      console.error("Error fetching bookings:", err);
      return res.status(500).json({ error: "Failed to load bookings" });
    }
    const parsed = rows.map((row) => ({
      ...row,
      activities: safeParseActivities(row.activities),
    }));
    res.json(parsed);
  });
});

app.post("/api/bookings", (req, res) => {
  const { roomId, guestName, checkIn, checkOut } = req.body || {};
  const activities = Array.isArray(req.body?.activities)
    ? req.body.activities
        .map((a) => Number(a))
        .filter((a) => Number.isFinite(a))
    : [];

  if (!roomId || !guestName || !checkIn || !checkOut) {
    return res
      .status(400)
      .json({ error: "roomId, guestName, checkIn, checkOut are required" });
  }

  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);
  if (Number.isNaN(checkInDate.getTime()) || Number.isNaN(checkOutDate.getTime())) {
    return res.status(400).json({ error: "Invalid dates" });
  }
  if (checkOutDate <= checkInDate) {
    return res
      .status(400)
      .json({ error: "checkOut must be after checkIn" });
  }

  db.get("SELECT * FROM rooms WHERE id = ?", [roomId], (err, room) => {
    if (err) {
      console.error("Error reading room:", err);
      return res.status(500).json({ error: "Failed to read room" });
    }
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    if (room.status === "occupied") {
      return res.status(409).json({ error: "Room already occupied" });
    }

    db.run(
      "INSERT INTO bookings (room_id, guest_name, check_in, check_out, activities) VALUES (?, ?, ?, ?, ?)",
      [roomId, guestName, checkIn, checkOut, JSON.stringify(activities)],
      function (insertErr) {
        if (insertErr) {
          console.error("Error creating booking:", insertErr);
          return res.status(500).json({ error: "Failed to create booking" });
        }

        db.run(
          "UPDATE rooms SET status = 'occupied' WHERE id = ?",
          [roomId],
          (updateErr) => {
            if (updateErr) {
              console.error("Error updating room status:", updateErr);

            }
          }
        );

        res.status(201).json({
          message: "Booking confirmed",
          booking: {
            id: this.lastID,
            roomId,
            guestName,
            checkIn,
            checkOut,
            activities,
          },
        });
      }
    );
  });
});

app.get("/api/activities", (_req, res) => {
  const query = `
    SELECT a.id, a.name, a.description, a.price,
           h.id AS hotelId, h.name AS hotelName
    FROM activities a
    JOIN hotels h ON a.hotel_id = h.id
    ORDER BY a.id
  `;

  db.all(query, (err, rows) => {
    if (err) {
      console.error("Error fetching activities:", err);
      return res.status(500).json({ error: "Failed to load activities" });
    }
    res.json(rows);
  });
});

app.get("/api/admin/overview", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Admin access required" });
  }

  try {
    const [hotels, rooms, bookings, activities] = await Promise.all([
      dbAll(
        `
        SELECT
          h.id, h.name, h.location,
          COUNT(r.id) AS totalRooms,
          SUM(CASE WHEN r.status = 'available' THEN 1 ELSE 0 END) AS availableRooms
        FROM hotels h
        LEFT JOIN rooms r ON r.hotel_id = h.id
        GROUP BY h.id
        ORDER BY h.id
      `
      ),
      dbAll(
        `
        SELECT r.id, r.type, r.price, r.status,
               h.name AS hotelName, h.location, h.id AS hotelId
        FROM rooms r
        JOIN hotels h ON r.hotel_id = h.id
        ORDER BY r.id
      `
      ),
      dbAll(
        `
        SELECT b.id, b.guest_name AS guestName, b.check_in AS checkIn, b.check_out AS checkOut,
               b.activities,
               b.created_at AS createdAt,
               r.id AS roomId, r.type AS roomType,
               h.id AS hotelId, h.name AS hotelName
        FROM bookings b
        JOIN rooms r ON b.room_id = r.id
        JOIN hotels h ON r.hotel_id = h.id
        ORDER BY b.created_at DESC
      `
      ),
      dbAll(
        `
        SELECT a.id, a.name, a.description, a.price,
               h.id AS hotelId, h.name AS hotelName
        FROM activities a
        JOIN hotels h ON a.hotel_id = h.id
        ORDER BY a.id
      `
      ),
    ]);

    res.json({
      hotels,
      rooms,
      bookings: bookings.map((b) => ({
        ...b,
        activities: safeParseActivities(b.activities),
      })),
      activities,
    });
  } catch (err) {
    console.error("Error building admin overview:", err);
    res.status(500).json({ error: "Failed to load admin overview" });
  }
});


app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

function safeParseActivities(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

app.listen(PORT, () => {
  console.log(`Hotel System backend listening on port ${PORT}`);
});
