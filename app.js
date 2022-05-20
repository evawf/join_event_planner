if (process.env.ENV !== "production") {
  dotenv.config();
}

import express from "express";
import pg from "pg";
import methodOverride from "method-override";
import path from "path";
import multer from "multer";
import cookieParser from "cookie-parser";
import jsSHA from "jssha";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import moment from "moment";
moment().format();

// Map
import mbxGeocoding from "@mapbox/mapbox-sdk/services/geocoding.js";
const mapBoxToken = process.env.MAPBOX_API_KEY;
const geocoder = mbxGeocoding({ accessToken: mapBoxToken });

// set the name of the upload directory here
const multerUpload = multer({ dest: "uploads/" });
const app = express();
const { Pool } = pg;
const PORT = process.env.PORT || 8080;
const SALT = process.env.MY_SALT;
const PLACE_KEY = process.env.PLACE_API_KEY;
const MAPBOX_KEY = process.env.MAPBOX_API_KEY;
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
    console.log(req.file);
    const shaObj = new jsSHA("SHA-512", "TEXT", { encoding: "UTF8" });
    shaObj.update(req.body.password);
    const hashedPassword = shaObj.getHash("HEX");
    const values = [
      req.body.first_name,
      req.body.last_name,
      req.file.filename,
      req.body.about_me,
      req.body.email,
      hashedPassword,
    ];
    console.log(values);
    await pool.query(
      "INSERT INTO users (first_name, last_name, avatar, about_me, email, hashed_password) VALUES ($1, $2, $3, $4, $5, $6)",
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
      `SELECT * FROM events WHERE events.public=true AND events.owner_id!=${userId}`
    );

    // console.log(publicEventsData.rows);
    // Events I created - Pink
    const myEventsData = await pool.query(
      `SELECT * FROM events WHERE owner_id=${userId}`
    );
    // console.log(myEventsData.rows);
    // console.log(moment(myEventsData.rows[0].start_date)); // return how many days from today

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
    res.render("newEvent", {
      place_key: PLACE_KEY,
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
      req.body.live,
      req.body.public,
    ];
    const eventData = await pool.query(
      "INSERT INTO events (name, start_date, start_time, end_date, end_time, event_link, event_location, description, owner_id,live,public) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
      data
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
    const commentData = await pool.query(
      `
      SELECT c.created_at, c.comment, u.first_name
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE event_id=$1
      `,
      [id]
    );
    const userJoinData = await pool.query(
      `
      SELECT j.isJoin, u.avatar
      FROM user_events j
      JOIN users u ON j.user_id = u.id AND j.isJoin=true
      WHERE event_id=$1
      `,
      [id]
    );

    const likesData = await pool.query(
      "SELECT * FROM likes WHERE event_id=$1 AND liked=$2",
      [id, true]
    );

    const location = eventData.rows[0].event_location;
    const geoData = await geocoder
      .forwardGeocode({
        query: location,
        limit: 1,
      })
      .send();
    const coodinatesData = geoData.body.features[0].geometry;
    res.render("event", {
      event: eventData.rows[0],
      userId: userId,
      owner: ownerData.rows[0],
      comments: commentData.rows,
      user_avatars: userJoinData.rows,
      likes: likesData.rows,
      MAPBOX_KEY: MAPBOX_KEY,
      geoLon: coodinatesData.coordinates[0],
      geoLat: coodinatesData.coordinates[1],
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
    const userId = req.cookies.userId;
    const ownerId = eventData.rows[0].owner_id;
    if (Number(userId) === Number(ownerId)) {
      res.render("editEvent", {
        event: eventData.rows[0],
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

const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    let location;
    if (req.body.event_location) {
      location = req.body.event_location;
    } else {
      location = "Online";
    }
    // Update event table
    await pool.query(
      "UPDATE events SET name=$1, start_date=$2, start_time=$3, end_date=$4, end_time=$5, event_link=$6, event_location=$7, description=$8, owner_id=$9, live=$10, public=$11 WHERE id=$12",
      [
        req.body.event_name.trim(),
        req.body.start_date,
        req.body.start_time,
        req.body.end_date,
        req.body.end_time,
        req.body.event_link,
        location,
        req.body.description.trim(),
        req.cookies.userId,
        req.body.live,
        req.body.public,
        id,
      ]
    );
    res.redirect(`/event/${id}`);
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, event editting is not working!");
    return;
  }
};

const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM events WHERE id=$1", [id]);
    await pool.query("DELETE FROM user_events WHERE event_id=$1", [id]);
    await pool.query("DELETE FROM comments WHERE event_id=$1", [id]);
    await pool.query("DELETE FROM likes WHERE event_id=$1", [id]);
    // To delete event from other tables where there is a event_id, to be added
    res.redirect("/myEvents");
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, event editting is not working!");
    return;
  }
};

const postComments = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      "INSERT INTO comments (event_id, comment, user_id) VALUES ($1, $2, $3)",
      [id, req.body.comment, req.cookies.userId]
    );
    res.redirect(`/event/${id}`);
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, event editting is not working!");
    return;
  }
};

const postJoin = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.cookies.userId;
    const userJoinData = await pool.query(
      "SELECT * FROM user_events WHERE user_id=$1 AND event_id=$2",
      [userId, id]
    );
    const isUserJoined = userJoinData.rows[0];
    if (isUserJoined === undefined) {
      await pool.query(
        "INSERT INTO  user_events (isJoin, event_id, user_id) VALUES ($1, $2, $3)",
        [req.body.isJoin, id, req.cookies.userId]
      );
    } else {
      await pool.query("UPDATE user_events SET isJoin=$1", [req.body.isJoin]);
    }

    res.redirect(`/event/${id}`);
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, event editting is not working!");
    return;
  }
};

const postLikes = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.cookies.userId;
    const likesData = await pool.query(
      "SELECT * FROM likes WHERE event_id=$1 AND user_id=$2",
      [id, userId]
    );
    const isLiked = likesData.rows[0];
    if (isLiked === undefined) {
      const data = [true, id, userId];
      await pool.query(
        "INSERT INTO likes (liked, event_id, user_id) VALUES($1, $2, $3)",
        data
      );
      // Toggle Liked True/False
    } else if (isLiked.liked) {
      await pool.query(
        "UPDATE likes SET liked=$1 WHERE event_id=$2 AND user_id=$3",
        [false, id, userId]
      );
    } else {
      await pool.query(
        "UPDATE likes SET liked=$1 WHERE event_id=$2 AND user_id=$3",
        [true, id, userId]
      );
    }
    res.redirect(`/event/${id}`);
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, event editting is not working!");
    return;
  }
};

const showUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const userData = await pool.query("SELECT * FROM users WHERE id=$1", [id]);
    console.log(userData.rows[0]);
    res.send("got user");
    // res.render("user", { user: userData.rows[0] });
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, event editting is not working!");
    return;
  }
};

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
app.post("/signup", multerUpload.single("avatar"), postUserAccount);
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
app.put("/event/:id/edit", isLoggedIn, updateEvent);
app.delete("/event/:id", isLoggedIn, deleteEvent);

// Comments route
app.post("/event/:id/comments", isLoggedIn, postComments);

// Join route
app.post("/event/:id/join", isLoggedIn, postJoin);

// Likes route
app.post("/event/:id/likes", isLoggedIn, postLikes);

// User routes
app.get("/user/:id", isLoggedIn, showUserProfile);

app.listen(PORT, () => {
  console.log(`App is listening on port ${PORT}.`);
});
