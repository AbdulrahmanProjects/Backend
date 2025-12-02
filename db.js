const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "hotel.db");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS hotels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hotel_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      price REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      guest_name TEXT NOT NULL,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )
  `);

  db.get("SELECT COUNT(*) as count FROM hotels", (err, row) => {
    if (err) {
      console.error("Error checking hotels seed:", err);
      return;
    }
    if (row && row.count === 0) {
      seedData();
    }
  });
});

function seedData() {
  const hotels = [
    { name: "Burj Al Arab", location: "Dubai, UAE" },
    { name: "The Ritz Paris", location: "Paris, France" },
    { name: "Marina Bay Sands", location: "Singapore" },
    { name: "Four Seasons Resort Maldives", location: "Maldives" },
  ];

  const rooms = [

    { hotelIndex: 0, type: "deluxe suite", price: 1200 },
    { hotelIndex: 0, type: "panoramic suite", price: 1500 },

    { hotelIndex: 1, type: "superior", price: 750 },
    { hotelIndex: 1, type: "executive suite", price: 1100 },

    { hotelIndex: 2, type: "deluxe", price: 450 },
    { hotelIndex: 2, type: "club room", price: 650 },

    { hotelIndex: 3, type: "beach villa", price: 1600 },
    { hotelIndex: 3, type: "water villa", price: 1900 },
  ];

  db.serialize(() => {
    const insertHotel = db.prepare(
      "INSERT INTO hotels (name, location) VALUES (?, ?)"
    );
    hotels.forEach((h) => insertHotel.run(h.name, h.location));
    insertHotel.finalize((hotelErr) => {
      if (hotelErr) {
        console.error("Error seeding hotels:", hotelErr);
        return;
      }

      db.all("SELECT id FROM hotels ORDER BY id", (err, rows) => {
        if (err) {
          console.error("Error reading hotels for seeding rooms:", err);
          return;
        }
        const insertRoom = db.prepare(
          "INSERT INTO rooms (hotel_id, type, price, status) VALUES (?, ?, ?, 'available')"
        );
        rooms.forEach((room) => {
          const hotelId = rows[room.hotelIndex]?.id;
          if (hotelId) {
            insertRoom.run(hotelId, room.type, room.price);
          }
        });
        insertRoom.finalize((roomErr) => {
          if (roomErr) {
            console.error("Error seeding rooms:", roomErr);
          } else {
            console.log("Seeded hotels and rooms.");
          }
        });
      });
    });
  });
}

module.exports = db;
