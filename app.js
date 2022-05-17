import express from "express";
import pg from "pg";
import methodOverride from "method-override";
import path from "path";
import multer from "multer";
import cookieParser from "cookie-parser";
import jsSHA from "jssha";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
// import { client_encoding } from "pg/lib/defaults";

if (process.env.ENV !== "production") {
  dotenv.config();
}

// set the name of the upload directory here
const multerUpload = multer({ dest: "uploads/" });
const app = express();
const { Pool } = pg;
const PORT = process.env.PORT || 8080;
const SALT = process.env.MY_SALT;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pgConnectionConfigs = {
  user: "eva",
  host: "localhost",
  database: "joindb",
  port: 5432,
};
const pool = new Pool(pgConnectionConfigs);

//Static Files
app.use(express.json());
app.use(express.static("public"));
app.use(express.static(__dirname + "/public"));
app.use(express.urlencoded({ extended: false }));
app.use(methodOverride("_method"));
app.use(express.static("uploads"));
app.use(cookieParser());

// Set templating engine
app.set("view engine", "ejs");

/*
 ***************  Callback Functions  *****************
 */
const displayHomepage = (req, res) => {
  res.render("home");
};

const createUserAccount = async (req, res) => {
  try {
    res.render("signupForm");
  } catch (error) {
    console.log("Error messge:", error);
    res.status(404).send("Sorry, can't find login form!");
    return;
  }
};

const postUserAccount = async (req, res) => {
  try {
    const shaObj = new jsSHA("SHA-512", "TEXT", { encoding: "UTF8" });
    shaObj.update(req.body.password);
    const hashedPassword = shaObj.getHash("HEX");
    const values = [
      req.body.first_name,
      req.body.last_name,
      req.body.email,
      hashedPassword,
    ];
    console.log(values);
    await pool.query(
      "INSERT INTO users (first_name, last_name, email, hashed_password) VALUES ($1, $2, $3, $4)",
      values
    );
    res.redirect("/login");
  } catch (error) {
    console.log("Error messge:", error);
    res.status(404).send("Sorry, something went wrong!");
    return;
  }
};

const renderUserLogin = async (req, res) => {
  try {
    res.render("loginForm");
  } catch (error) {
    console.log("Error messge:", error);
    res.status(404).send("Sorry, can't find login form!");
    return;
  }
};

const authUserLogin = async (req, res) => {
  if (req.isUserLoggedIn === true) {
    res.redirect("/events");
    return;
  }
  try {
    const values = [req.body.email];
    const result = await pool.query(
      "SELECT * from users WHERE email=$1",
      values
    );
    if (result.rows.length === 0) {
      res.status(403).send("sorry! User doesn't exist!");
      return;
    }
    const user = result.rows[0];
    const shaObj = new jsSHA("SHA-512", "TEXT", { encoding: "UTF8" });
    shaObj.update(req.body.password);
    const hashedPassword = shaObj.getHash("HEX");
    if (user.hashed_password !== hashedPassword) {
      res.status(403).send("Login failed!");
      return;
    } else {
      // Generate the hashed cookie value
      const shaObj1 = new jsSHA("SHA-512", "TEXT", { encoding: "UTF8" });
      const unhashedCookieString = `${user.id}-${SALT}`;
      shaObj1.update(unhashedCookieString);
      const hashedCookieString = shaObj1.getHash("HEX");

      res.cookie("loggedIn", hashedCookieString);
      res.cookie("userId", user.id);
      res.redirect("/events");
      return;
    }
  } catch (error) {
    console.log("Error messge:", error);
    res.status(404).send("Sorry, can't find user info!");
    return;
  }
};

const logoutUser = async (req, res) => {
  await res.clearCookie("loggedIn").clearCookie("userId").redirect("/login");
};

const showAllEvents = async (req, res) => {
  try {
    // Public Events - Blue
    const userId = req.cookies.userId;
    const publicEventsData = await pool.query(
      `SELECT * FROM events INNER JOIN event_types ON events.id=event_types.event_id WHERE event_types.type2_id=2 AND events.owner_id!=${userId}`
    );
    // console.log(publicEventsData.rows);
    // Events I created - Pink
    const myEventsData = await pool.query(
      `SELECT * FROM events WHERE owner_id=${userId}`
    );
    // console.log(myEventsData.rows);
    // Events I was invited - Green - To Be Added Later
    res.render("events", {
      publicEvents: publicEventsData.rows,
      myEvents: myEventsData.rows,
    });
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, unable to get the event list!");
    return;
  }
};

const showMyEvents = async (req, res) => {
  try {
    const userId = req.cookies.userId;
    const myEventsData = await pool.query(
      `SELECT * FROM events WHERE owner_id=${userId}`
    );
    res.render("myEvents", { myEvents: myEventsData.rows });
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, unable to get the my event list!");
    return;
  }
};

const createEvent = async (req, res) => {
  try {
    const type1sData = await pool.query("SELECT * FROM type1s");
    const type2sData = await pool.query("SELECT * FROM type2s");
    res.render("newEvent", {
      type1s: type1sData.rows,
      type2s: type2sData.rows,
    });
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, can't find create event page!");
    return;
  }
};

const postEvent = async (req, res) => {
  try {
    let location;
    if (req.body.event_location) {
      location = req.body.event_location;
    } else {
      location = "Online";
    }

    const data = [
      req.body.event_name.trim(),
      req.body.start_date,
      req.body.start_time,
      req.body.end_date,
      req.body.end_time,
      req.body.event_link,
      location,
      req.body.description.trim(),
      req.cookies.userId,
    ];
    // console.log(data);
    const eventData = await pool.query(
      "INSERT INTO events (name, start_date, start_time, end_date, end_time, event_link, event_location, description, owner_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING * ",
      data
    );
    const event_id = eventData.rows[0].id;
    const type1_id = req.body.event_type1s;
    const type2_id = req.body.event_type2s;
    await pool.query(
      "INSERT INTO event_types (event_id, type1_id, type2_id) VALUES ($1, $2, $3) RETURNING * ",
      [event_id, type1_id, type2_id]
    );
    res.redirect("/events");
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, new event page is not working!");
    return;
  }
};

const displayEventInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const eventData = await pool.query("SELECT * FROM events WHERE id=$1", [
      id,
    ]);
    const userId = req.cookies.userId;
    const ownerId = eventData.rows[0].owner_id;
    const ownerData = await pool.query("SELECT * FROM users WHERE id=$1", [
      ownerId,
    ]);
    res.render("event", {
      event: eventData.rows[0],
      userId: userId,
      owner: ownerData.rows[0],
    });
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, event page is not working!");
    return;
  }
};

const editEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const eventData = await pool.query("SELECT * FROM events WHERE id=$1", [
      id,
    ]);
    const type1sData = await pool.query("SELECT * FROM type1s");
    const type2sData = await pool.query("SELECT * FROM type2s");
    const userId = req.cookies.userId;
    const ownerId = eventData.rows[0].owner_id;
    if (Number(userId) === Number(ownerId)) {
      res.render("editEvent", {
        event: eventData.rows[0],
        type1s: type1sData.rows,
        type2s: type2sData.rows,
      });
    } else {
      res.status(404).send("Sorry, only event owner can edit this page!");
      return;
    }
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, event editting is not working!");
    return;
  }
};

const updateEvent = async (req, res) => {};

/***************************************************************
 Middleware for Login check
 **************************************************************/
const getHash = (input) => {
  const shaObj = new jsSHA("SHA-512", "TEXT", { encoding: "UTF8" });
  const unhashedString = `${input}-${SALT}`;
  shaObj.update(unhashedString);
  return shaObj.getHash("HEX");
};

app.use((req, res, next) => {
  req.isUserLoggedIn = false;
  res.locals.loggedIn = false;
  if (req.cookies.loggedIn && req.cookies.userId) {
    const hash = getHash(req.cookies.userId);
    if (req.cookies.loggedIn === hash) {
      const userQuery = `SELECT * FROM users WHERE id=$1`;
      pool
        .query(userQuery, [req.cookies.userId])
        .then((userQueryResult) => {
          if (userQueryResult.rows.length === 0) {
            res.redirect("/login");
            return;
          }
          let user = userQueryResult.rows[0];
          req.user = userQueryResult.rows[0];
          res.locals.currentUser = user;
          req.isUserLoggedIn = true;
          res.locals.loggedIn = true;
          next();
        })
        .catch((error) => {
          console.log("error");
        });
      return;
    }
  }
  next();
});

const isLoggedIn = async (req, res, next) => {
  if (req.isUserLoggedIn) {
    next();
    return;
  }
  await res.redirect("/login");
};

/*
 ***************  Routes  *****************
 */

// Render Homepage
app.get("/", displayHomepage);

// Sign up and Log in/out routes
app.get("/signup", createUserAccount);
app.post("/signup", postUserAccount);
app.get("/login", renderUserLogin);
app.post("/login", authUserLogin);
app.get("/logout", logoutUser);

// Event routes
app.get("/events", isLoggedIn, showAllEvents);
app.get("/myEvents", isLoggedIn, showMyEvents);
app.get("/newEvent", isLoggedIn, createEvent);
app.post("/newEvent", isLoggedIn, postEvent);
app.get("/event/:id", isLoggedIn, displayEventInfo);
app.get("/event/:id/edit", isLoggedIn, editEvent);
app.post("/event/:id/edit", isLoggedIn, updateEvent);
// app.delete("/event/:id", isLoggedIn, deleteEvent)

app.listen(PORT, () => {
  console.log(`App is listening on port ${PORT}.`);
});
