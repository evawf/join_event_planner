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
// import io from "socket.io";

// Mapbox API
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

const dateFormat = "LL";
const timeFormat = "LT";
app.locals.moment = moment;
app.locals.dateFormat = dateFormat;
app.locals.timeFormat = timeFormat;

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
      req.file.filename,
      req.body.about_me,
      req.body.email,
      hashedPassword,
    ];
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
    const userId = req.cookies.userId;
    const res1 = await pool.query("SELECT * FROM users WHERE id=$1", [userId]);
    const userData = res1.rows[0];
    // Public Events from other users - Blue
    const res2 = await pool.query(
      `SELECT * FROM events WHERE public=true AND owner_id!=${userId} AND end_date>CURRENT_DATE`
    );
    const publicEventsData = res2.rows;

    // Public Events I created - Green
    const res3 = await pool.query(
      `SELECT * FROM events WHERE public=true AND owner_id=${userId} AND end_date>CURRENT_DATE`
    );
    const myEventsData = res3.rows;

    // Private Events I was invited - Green - To Be Added Later

    res.render("events", {
      user: userData,
      publicEvents: publicEventsData,
      myEvents: myEventsData,
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
    const res1 = await pool.query("SELECT * FROM users WHERE id=$1", [userId]);
    const userData = res1.rows[0];
    const res2 = await pool.query(
      `
      SELECT * 
      FROM events 
      WHERE owner_id=${userId}
      `
    );
    const myEventsData = res2.rows;
    res.render("myEvents", {
      user: userData,
      myEvents: myEventsData,
    });
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, unable to get the my event list!");
    return;
  }
};

const showPastEvents = async (req, res) => {
  try {
    const userId = req.cookies.userId;
    const res1 = await pool.query(
      `
      SELECT e.id,
        e.name,
        e.start_date,
        e.start_time,
        e.event_location,
        e.description,
        ue.id AS user_events_id
      FROM events e
      JOIN user_events ue ON e.id = ue.event_id 
      WHERE e.end_date < NOW()
        AND ue.isJoin=true
        AND ue.user_id=$1
      `,
      [userId]
    );
    const pastEventsData = res1.rows;
    res.render("pastEvents", {
      pastEvents: pastEventsData,
    });
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, page is not working!");
    return;
  }
};

const showIncomingEvents = async (req, res) => {
  try {
    const userId = req.cookies.userId;
    const res1 = await pool.query(
      `
      SELECT e.id,
        e.name,
        e.start_date,
        e.start_time,
        e.event_location,
        e.description,
        ue.id AS user_events_id
      FROM events e
      JOIN user_events ue ON e.id = ue.event_id 
      WHERE e.end_date > NOW()
        AND ue.isJoin=true
        AND ue.user_id = $1 
      `,
      [userId]
    );
    const incomingEventsData = res1.rows;
    res.render("incomingEvents", {
      incomingEvents: incomingEventsData,
    });
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, page is not working!");
    return;
  }
};

const createEvent = async (req, res) => {
  try {
    const userId = req.cookies.userId;
    const res1 = await pool.query("SELECT * FROM users WHERE id=$1", [userId]);
    const userData = res1.rows[0];
    res.render("newEvent", {
      user: userData,
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
    await pool.query(
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
    const res1 = await pool.query("SELECT * FROM events WHERE id=$1", [id]);
    const eventData = res1.rows[0];
    const userId = req.cookies.userId;
    const res2 = await pool.query("SELECT * FROM users WHERE id=$1", [userId]);
    const userData = res2.rows[0];
    // Event Owner
    const ownerId = eventData.owner_id;
    const res3 = await pool.query("SELECT * FROM users WHERE id=$1", [ownerId]);
    const ownerData = res3.rows[0];
    const res4 = await pool.query(
      `
      SELECT c.created_at, c.comment, u.first_name
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE event_id=$1
      `,
      [id]
    );
    const commentData = res4.rows;
    const res5 = await pool.query(
      `
      SELECT j.isJoin, u.avatar, u.id
      FROM user_events j
      JOIN users u ON j.user_id = u.id AND j.isJoin=true
      WHERE event_id=$1
      `,
      [id]
    );
    const userJoinData = res5.rows;
    const res6 = await pool.query(
      "SELECT * FROM likes WHERE event_id=$1 AND liked=$2",
      [id, true]
    );
    const likesData = res6.rows;
    const location = eventData.event_location;
    const geoData = await geocoder
      .forwardGeocode({
        query: location,
        limit: 1,
      })
      .send();
    const coodinatesData = geoData.body.features[0].geometry;
    res.render("event", {
      event: eventData,
      userId: userId,
      user: userData,
      owner: ownerData,
      comments: commentData,
      attendees: userJoinData,
      likes: likesData,
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
    const res1 = await pool.query("SELECT * FROM events WHERE id=$1", [id]);
    const eventData = res1.rows[0];
    const userId = req.cookies.userId;
    const res2 = await pool.query("SELECT * FROM users WHERE id=$1", [userId]);
    const userData = res2.rows[0];
    const ownerId = eventData.owner_id;
    if (Number(userId) === Number(ownerId)) {
      res.render("editEvent", {
        user: userData,
        event: eventData,
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
    const res1 = await pool.query(
      "SELECT * FROM user_events WHERE user_id=$1 AND event_id=$2",
      [userId, id]
    );
    const userJoinData = res1.rows[0];
    const isUserJoined = userJoinData;
    if (isUserJoined === undefined) {
      await pool.query(
        "INSERT INTO  user_events (isJoin, event_id, user_id) VALUES ($1, $2, $3)",
        [req.body.isJoin, id, req.cookies.userId]
      );
    } else {
      await pool.query(
        "UPDATE user_events SET isJoin=$1 WHERE event_id=$2 AND user_id=$3",
        [req.body.isJoin, id, userId]
      );
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
    const res1 = await pool.query(
      "SELECT * FROM likes WHERE event_id=$1 AND user_id=$2",
      [id, userId]
    );
    const likesData = res1.rows[0];
    const isLiked = likesData;
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
    const currentUserId = req.cookies.userId;
    const res0 = await pool.query("SELECT * FROM users WHERE id=$1", [id]);
    const userData = res0.rows[0];
    const res1 = await pool.query(
      "SELECT count(1) FROM followers WHERE followee_id = $1 AND follower_id = $2",
      [id, currentUserId]
    );
    const following = res1.rows[0].count > 0 ? true : false;
    // Get followers
    const res2 = await pool.query(
      "SELECT followee_id, avatar FROM followers INNER JOIN users ON followee_id=users.id WHERE follower_id=$1",
      [id]
    );
    const followeesData = res2.rows;
    // Get following info
    const res3 = await pool.query(
      "SELECT follower_id, avatar FROM followers INNER JOIN users ON follower_id=users.id WHERE followee_id=$1",
      [id]
    );
    const followersData = res3.rows;
    res.render("userProfile", {
      user: userData,
      following: following,
      followees: followeesData,
      followers: followersData,
    });
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, page is not working!");
    return;
  }
};

const unfollowUser = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.cookies.userId;
    const res0 = await pool.query(
      "SELECT count(1) FROM followers WHERE followee_id = $1 AND follower_id = $2",
      [id, currentUserId]
    );
    let following = res0.rows[0] ? true : false;
    console.log("first");
    console.log(following);
    if (following) {
      await pool.query(
        "DELETE FROM followers WHERE followee_id = $1 AND follower_id = $2",
        [id, currentUserId]
      );
    }
    res.redirect(`/user/${id}`);
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, site is not working!");
    return;
  }
};

const followUser = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.cookies.userId;
    const res0 = await pool.query(
      "SELECT count(1) FROM followers WHERE followee_id = $1 AND follower_id = $2",
      [id, currentUserId]
    );
    let following = res0.rows[0] ? true : false;
    if (following) {
      await pool.query(
        "INSERT INTO followers( follower_id, followee_id ) VALUES ( $1, $2)",
        [currentUserId, id]
      );
    }
    res.redirect(`/user/${id}`);
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, site is not working!");
    return;
  }
};

const editUserPage = async (req, res) => {
  try {
    const userId = req.cookies.userId;
    const res1 = await pool.query("SELECT * FROM users WHERE id=$1", [userId]);
    const userData = res1.rows[0];
    console.log(userData);
    res.render("editUserPage", {
      user: userData,
    });
  } catch (err) {
    console.log("Error message:", err);
    res.status(404).send("Sorry, event editting is not working!");
    return;
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const userId = req.cookies.userId;
    console.log(userId);
    console.log(req.body);
    const { first_name, last_name, about_me } = req.body;
    console.log(first_name);
    console.log(req?.file?.filename);
    let values;
    if (req?.file?.filename) {
      values = [first_name, last_name, req.file.filename, about_me, userId];
      await pool.query(
        "UPDATE users SET first_name=$1, last_name=$2, avatar=3$, about_me=$4 WHERE id=$5",
        values
      );
    } else {
      values = [first_name, last_name, about_me, userId];
      await pool.query(
        "UPDATE users SET first_name=$1, last_name=$2, about_me=$3 WHERE id=$4",
        values
      );
    }
    res.redirect(`/user/${userId}`);
  } catch (error) {
    console.log("Error messge:", error);
    res.status(404).send("Sorry, something went wrong!");
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
app.get("/events", isLoggedIn, showAllEvents); // Public Events and Events created by me
app.get("/myEvents", isLoggedIn, showMyEvents); // Events created by me
app.get("/pastEvents", isLoggedIn, showPastEvents); // All Past Events I joined
app.get("/inComingEvents", isLoggedIn, showIncomingEvents); // All Incoming Events I joined

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
app.post("/user/:id/unfollow", isLoggedIn, unfollowUser);
app.post("/user/:id/follow", isLoggedIn, followUser);
app.get("/user/:id/edit", isLoggedIn, editUserPage);
app.put("/user/:id/edit", isLoggedIn, updateUserProfile);

app.listen(PORT, () => {
  console.log(`App is listening on port ${PORT}.`);
});
