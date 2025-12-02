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
      activities TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hotel_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
    )
  `);

  db.get("SELECT COUNT(*) as count FROM hotels", (err, row) => {
    if (err) {
      console.error("Error checking hotels seed:", err);
      return;
    }
    if (row && row.count === 0) {
      seedData();
    } else {
      db.get("SELECT COUNT(*) as count FROM activities", (actErr, actRow) => {
        if (actErr) {
          console.error("Error checking activities seed:", actErr);
          return;
        }
        if (actRow && actRow.count === 0) {
          seedActivitiesOnly();
        }
      });
    }
  });

  ensureBookingsHasActivitiesColumn();
});

function ensureBookingsHasActivitiesColumn() {
  db.all("PRAGMA table_info(bookings)", (err, columns) => {
    if (err) {
      console.error("Error reading bookings schema:", err);
      return;
    }
    const hasActivities = columns.some((col) => col.name === "activities");
    if (!hasActivities) {
      db.run(
        "ALTER TABLE bookings ADD COLUMN activities TEXT NOT NULL DEFAULT '[]'",
        (alterErr) => {
          if (alterErr) {
            console.error("Error adding activities column to bookings:", alterErr);
          } else {
            console.log("Added activities column to bookings table.");
          }
        }
      );
    }
  });
}

function seedData() {
  const hotels = [
    { name: "Burj Al Arab", location: "Dubai, UAE" },
    { name: "The Ritz Paris", location: "Paris, France" },
    { name: "Marina Bay Sands", location: "Singapore" },
    { name: "Four Seasons Resort Maldives", location: "Maldives" },
  ];

  const rooms = [
    // Burj Al Arab
    { hotelIndex: 0, type: "deluxe suite", price: 1200 },
    { hotelIndex: 0, type: "panoramic suite", price: 1500 },
    // The Ritz Paris
    { hotelIndex: 1, type: "superior", price: 750 },
    { hotelIndex: 1, type: "executive suite", price: 1100 },
    // Marina Bay Sands
    { hotelIndex: 2, type: "deluxe", price: 450 },
    { hotelIndex: 2, type: "club room", price: 650 },
    // Four Seasons Maldives
    { hotelIndex: 3, type: "beach villa", price: 1600 },
    { hotelIndex: 3, type: "water villa", price: 1900 },
  ];

  const activities = [
    { hotelIndex: 0, name: "Spa", description: "Luxury spa treatment with sea view", price: 180 },
    { hotelIndex: 1, name: "Gym", description: "Access to premium fitness center", price: 50 },
    { hotelIndex: 2, name: "Personal Training", description: "One-on-one fitness coaching", price: 120 },
    { hotelIndex: 3, name: "Indoor Pool", description: "Climate-controlled indoor pool session", price: 60 },
    { hotelIndex: 0, name: "Outdoor Pool", description: "Infinity outdoor pool access", price: 70 },
    { hotelIndex: 1, name: "Hotel Restaurants", description: "Gourmet multi-course dining", price: 90 },
    { hotelIndex: 2, name: "Room Service", description: "24/7 in-room dining service", price: 40 },
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
          }

          const insertActivity = db.prepare(
            "INSERT INTO activities (hotel_id, name, description, price) VALUES (?, ?, ?, ?)"
          );
          activities.forEach((activity) => {
            const hotelId = rows[activity.hotelIndex]?.id;
            if (hotelId) {
              insertActivity.run(
                hotelId,
                activity.name,
                activity.description,
                activity.price
              );
            }
          });
          insertActivity.finalize((actErr) => {
            if (actErr) {
              console.error("Error seeding activities:", actErr);
            } else {
              console.log("Seeded hotels, rooms, and activities.");
            }
          });
        });
      });
    });
  });
}

function seedActivitiesOnly() {
  const activities = [
    { hotelIndex: 0, name: "Spa", description: "Luxury spa treatment with sea view", price: 180 },
    { hotelIndex: 1, name: "Gym", description: "Access to premium fitness center", price: 50 },
    { hotelIndex: 2, name: "Personal Training", description: "One-on-one fitness coaching", price: 120 },
    { hotelIndex: 3, name: "Indoor Pool", description: "Climate-controlled indoor pool session", price: 60 },
    { hotelIndex: 0, name: "Outdoor Pool", description: "Infinity outdoor pool access", price: 70 },
    { hotelIndex: 1, name: "Hotel Restaurants", description: "Gourmet multi-course dining", price: 90 },
    { hotelIndex: 2, name: "Room Service", description: "24/7 in-room dining service", price: 40 },
  ];

  db.all("SELECT id FROM hotels ORDER BY id", (err, rows) => {
    if (err) {
      console.error("Error loading hotels for activities seed:", err);
      return;
    }
    if (!rows || rows.length === 0) return;

    const insertActivity = db.prepare(
      "INSERT INTO activities (hotel_id, name, description, price) VALUES (?, ?, ?, ?)"
    );
    activities.forEach((activity) => {
      const hotelId = rows[activity.hotelIndex]?.id;
      if (hotelId) {
        insertActivity.run(
          hotelId,
          activity.name,
          activity.description,
          activity.price
        );
      }
    });
    insertActivity.finalize((err2) => {
      if (err2) {
        console.error("Error seeding activities:", err2);
      } else {
        console.log("Seeded activities.");
      }
    });
  });
}

module.exports = db;
