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

let pgConnectionConfigs;

if (process.env.DATABASE_URL) {
  pgConnectionConfigs = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  };
} else {
  pgConnectionConfigs = {
    user: "eva",
    host: "localhost",
    database: "joindb",
    port: 5432,
  };
}

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

const createUserAccount = (req, res) => {
  try {
    res.render("signupForm");
  } catch (error) {
    console.log("Error messge:", error);
    res.status(404).render("error", { error: error });
    return;
  }
};

const postUserAccount = async (req, res) => {
  try {
    const shaObj = new jsSHA("SHA-512", "TEXT", { encoding: "UTF8" });
    shaObj.update(req.body.password);
    const hashedPassword = shaObj.getHash("HEX");
    const newUserEmail = req.body.email;
    const res0 = await pool.query("SELECT * FROM users");
    const userData = res0.rows;
    for (let i = 0; i < userData.length; i += 1) {
      // If email already registered
      if (newUserEmail === userData[i].email) {
        res
          .status(404)
          .render("error0", { error: "Sorry, user already exists!" });
        return;
      }
    }

    if (req?.file?.filename) {
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
    } else {
      const values = [
        req.body.first_name,
        req.body.last_name,
        "574ac79478da34f68d898c69bdc8ffda",
        req.body.about_me,
        req.body.email,
        hashedPassword,
      ];
      await pool.query(
        "INSERT INTO users (first_name, last_name, avatar, about_me, email, hashed_password) VALUES ($1, $2, $3, $4, $5, $6)",
        values
      );
    }
    res.redirect("/login");
  } catch (error) {
    console.log("Error messge:", error);
    res.status(404).render("error", { error: error });
    return;
  }
};

const renderUserLogin = async (req, res) => {
  try {
    res.render("loginForm");
  } catch (error) {
    console.log("Error messge:", error);
    res.status(404).render("error", { error: error });
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
      res.status(403).render("error0", {
        error: "User doesn't exist, please register first!",
      });
      return;
    }
    const user = result.rows[0];
    const shaObj = new jsSHA("SHA-512", "TEXT", { encoding: "UTF8" });
    shaObj.update(req.body.password);
    const hashedPassword = shaObj.getHash("HEX");
    if (user.hashed_password !== hashedPassword) {
      res.status(403).render("error0", {
        error: "Wrong password!",
      });
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
    res.status(404).render("error0", { error: error });
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
      `SELECT 
      e.id, e.name, e.start_time, e.start_date, e.event_location, e.owner_id,
      u.avatar
      FROM events e
      INNER JOIN users u
      ON e.owner_id = u.id
      WHERE public=true AND end_date>=CURRENT_DATE 
      ORDER by start_date, start_time ASC`
    );
    const publicEventsData = res2.rows;
    res.render("events", {
      user: userData,
      publicEvents: publicEventsData,
    });
  } catch (error) {
    console.log("Error message:", error);
    res.status(404).render("error", { error: error });
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
      SELECT 
      e.id, e.name, e.start_time, e.start_date, e.event_location, e.owner_id,
      u.avatar
      FROM events e
      INNER JOIN users u
      ON e.owner_id = u.id
      WHERE e.owner_id=$1 AND e.public=FALSE
      ORDER by e.start_date, e.start_time ASC
      `,
      [userId]
    );
    const myEventsData = res2.rows;
    res.render("myEvents", {
      user: userData,
      myEvents: myEventsData,
    });
  } catch (error) {
    console.log("Error message:", error);
    res.status(404).render("error", { error: error });
    return;
  }
};

const showPastEvents = async (req, res) => {
  try {
    const userId = req.cookies.userId;
    const res1 = await pool.query(
      `
      SELECT 
      e.id, e.name, e.start_date, e.start_time, e.event_location, e.owner_id,
      ue.id AS user_events_id,
      u.avatar 
      FROM events e
      JOIN user_events ue ON e.id = ue.event_id
      JOIN users u ON u.id=e.owner_id
      WHERE e.end_date < NOW()
      AND ue.isJoin=true
      AND ue.user_id=$1
      ORDER by e.start_date, e.start_time DESC;
      `,
      [userId]
    );
    const pastEventsData = res1.rows;
    res.render("pastEvents", {
      pastEvents: pastEventsData,
    });
  } catch (error) {
    console.log("Error message:", error);
    res.status(404).render("error", { error: error });
    return;
  }
};

const showIncomingEvents = async (req, res) => {
  try {
    const userId = req.cookies.userId;
    const res1 = await pool.query(
      `
      SELECT 
      e.id, e.name, e.start_date, e.start_time, e.event_location, e.owner_id,
      ue.id AS user_events_id,
      U.avatar
      FROM events e
      JOIN user_events ue ON e.id = ue.event_id
      JOIN users u ON u.id=e.owner_id
      WHERE e.end_date > NOW()
      AND ue.isJoin=true
      AND ue.user_id =$1
      ORDER by start_date, start_time ASC;
      `,
      [userId]
    );
    const incomingEventsData = res1.rows;
    res.render("incomingEvents", {
      incomingEvents: incomingEventsData,
    });
  } catch (error) {
    console.log("Error message:", error);
    res.status(404).render("error", { error: error });
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
  } catch (error) {
    console.log("Error message:", error);
    res.status(404).render("error", { error: error });
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
  } catch (error) {
    console.log("Error message:", error);
    res.status(404).render("error", { error: error });
    return;
  }
};

const displayEventInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.cookies.userId;
    const res0 = await pool.query(
      `
        SELECT *,
          start_date < now() AS past
        FROM events WHERE id=$1
      `,
      [id]
    );
    const eventData = res0.rows[0];
    // Check if public/private event, then check if user is invited to view private event
    if (!eventData.public && Number(userId) !== eventData.owner_id) {
      const res1 = await pool.query(
        `SELECT count(1) AS count
        FROM invitations
        WHERE event_id = $1 AND receiver_id = $2
        `,
        [id, userId]
      );
      if (res1.rows[0].count < 1) {
        res.status(403).render("error", {
          error: "You's not authorized to view this event!",
        });
      }
    }
    const userData = req.user;
    // Get comment data
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
      SELECT j.isjoin, u.avatar, u.id
      FROM user_events j
      JOIN users u ON j.user_id = u.id
      WHERE event_id=$1
      `,
      [id]
    );
    const userJoinData = res5.rows;
    const joining =
      userJoinData.filter((ue) => ue.id == userId && ue.isjoin).length > 0;
    const notJoining =
      userJoinData.filter((ue) => ue.id == userId && !ue.isjoin).length > 0;

    const res6 = await pool.query(
      "SELECT count(1) FROM likes WHERE event_id=$1 AND liked",
      [id]
    );
    const likesCount = res6.rows[0].count;
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
      joining,
      notJoining,
      user: userData,
      owner: ownerData,
      comments: commentData,
      attendees: userJoinData.filter((ue) => ue.isjoin),
      likes: likesCount,
      MAPBOX_KEY: MAPBOX_KEY,
      geoLon: coodinatesData.coordinates[0],
      geoLat: coodinatesData.coordinates[1],
    });
  } catch (error) {
    console.log("Error message:", error);
    res.status(404).render("error", { error: error });
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
        place_key: PLACE_KEY,
      });
    } else {
      res.status(404).send("Sorry, only event owner can edit this page!");
      return;
    }
  } catch (error) {
    console.log("Error message:", error);
    res.status(404).render("error", { error: error });
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
  } catch (error) {
    console.log("Error message:", error);
    res.status(404).render("error", { error: error });
    return;
  }
};

const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.cookies.userId;
    // Delete event from other tables where there is a event_id, to be added
    await pool.query("DELETE FROM user_events WHERE event_id=$1", [id]);
    await pool.query("DELETE FROM comments WHERE event_id=$1", [id]);
    await pool.query("DELETE FROM likes WHERE event_id=$1", [id]);
    await pool.query("DELETE FROM invitations WHERE sender_id=$1", [userId]);
    await pool.query("DELETE FROM events WHERE id=$1", [id]);
    res.redirect("/events");
  } catch (error) {
    console.log("Error message:", error);
    res.status(404).render("error", { error: error });
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
  } catch (error) {
    console.log("Error message:", error);
    res.status(404).render("error", { error: error });
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
  } catch (error) {
    console.log("Error message:", error);
    res.status(404).render("error", { error: error });
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
  } catch (error) {
    console.log("Error message:", error);
    res.status(404).render("error", { error: error });
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
  } catch (error) {
    console.log("Error message:", error);
    res.status(404).render("error", { error: error });
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
  } catch (error) {
    console.log("Error message:", error);
    res.status(404).render("error", { error: error });
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
  } catch (error) {
    console.log("Error message:", error);
    res.status(404).render("error", { error: error });
    return;
  }
};

const editUserInfo = async (req, res) => {
  try {
    const userId = req.cookies.userId;
    const res1 = await pool.query("SELECT * FROM users WHERE id=$1", [userId]);
    const userData = res1.rows[0];
    res.render("editUserInfo", {
      user: userData,
    });
  } catch (error) {
    console.log("Error message:", error);
    res.status(404).render("error", { error: error });
    return;
  }
};

const updateUserInfo = async (req, res) => {
  try {
    const userId = req.cookies.userId;
    const { first_name, last_name, about_me } = req.body;
    let values;
    if (req?.file?.filename) {
      values = [first_name, last_name, req.file.filename, about_me, userId];
      await pool.query(
        "UPDATE users SET first_name=$1, last_name=$2, avatar=$3, about_me=$4 WHERE id=$5",
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
    res.status(404).render("error", { error: error });
    return;
  }
};

const showInvitations = async (req, res) => {
  try {
    const userId = req.cookies.userId;
    // Get all invitations
    const res0 = await pool.query(
      `
      SELECT
      e.id, e.name, e.start_date, e.start_time, e.event_location, e.owner_id,
      ue.isJoin,
      U.avatar
      FROM events e
      JOIN invitations i ON e.id=i.event_id
      JOIN users u ON u.id=e.owner_id
      LEFT JOIN user_events ue ON i.receiver_id=ue.user_id AND i.event_id=ue.event_id
      WHERE i.receiver_id=$1                                             
      ORDER by e.start_date, e.start_time ASC`,
      [userId]
    );
    const invitationsData = res0.rows;
    res.render("invitations", {
      events: invitationsData,
    });
  } catch (error) {
    console.log("Error messge:", error);
    res.status(404).render("error", { error: error });
    return;
  }
};

const showInvitationForm = async (req, res) => {
  try {
    const { id } = req.params;
    const res0 = await pool.query("SELECT * FROM events WHERE id=$1", [id]);
    const eventData = res0.rows[0];
    const userId = req.cookies.userId;
    const res1 = await pool.query(
      `
      SELECT
      u.id,
      u.first_name,
      u.last_name,
      u.avatar
      FROM users u
      INNER JOIN followers f ON u.id=f.followee_id
      WHERE f.follower_id=$1
        AND u.id NOT IN (
          SELECT receiver_id
          FROM invitations
          WHERE event_id = $2
        )
        AND u.id NOT IN (
          SELECT user_id
          FROM user_events
          WHERE event_id = $3
        )
      `,
      [userId, id, id]
    );
    const friendsData = res1.rows;
    res.render("invitationForm", { friends: friendsData, event: eventData });
  } catch (error) {
    console.log("Error messge:", error);
    res.status(404).render("error", { error: error });
    return;
  }
};

const postInvitations = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.cookies.userId;
    const friendIds = req.body.friend_ids;
    // Invited one friend
    if (!Array.isArray(friendIds)) {
      await pool.query(
        `
          INSERT INTO invitations
          (sender_id, receiver_id, event_id)
          VALUES ($1, $2, $3)`,
        [userId, friendIds, id]
      );
    } else {
      for (let i = 0; i < friendIds.length; i += 1) {
        // Inivted more friends
        await pool.query(
          `
            INSERT INTO invitations
            (sender_id, receiver_id, event_id)
            VALUES ($1, $2, $3)`,
          [userId, friendIds[i], id]
        );
      }
    }
    res.redirect(`/event/${id}`);
  } catch (error) {
    console.log("Error messge:", error);
    res.status(404).render("error", { error: error });
    return;
  }
};

const showSearchResult = async (req, res) => {
  try {
    const res0 = await pool.query("SELECT search_str FROM searches");
    const x = res0.rows.length - 1;
    const searchStr = res0.rows[x].search_str;
    const res1 = await pool.query(
      `SELECT * FROM users WHERE SIMILARITY(first_name, $1) > 0.4`,
      [searchStr]
    );
    const searchResults = res1.rows;
    if (searchResults[0] === undefined) {
      res.render("searchResult", { users: "0" });
    } else {
      res.render("searchResult", { users: searchResults });
    }
  } catch (error) {
    console.log("Error messge:", error);
    res.status(404).render("error", { error: error });
    return;
  }
};

const postSearch = async (req, res) => {
  try {
    const searchStr = req.body.search;
    await pool.query("INSERT INTO searches (search_str) VALUES($1)", [
      searchStr,
    ]);
    res.redirect("/result");
  } catch (error) {
    console.log("Error messge:", error);
    res.status(404).render("error", { error: error });
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
          console.log("error", error);
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
app.get("/events", isLoggedIn, showAllEvents); // Public Events and Public Events created by me
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
app.get("/user/:id/edit", isLoggedIn, editUserInfo);
app.put(
  "/user/:id/edit",
  isLoggedIn,
  multerUpload.single("avatar"),
  updateUserInfo
);
// Invitation routes
app.get("/invitations", isLoggedIn, showInvitations);
app.get("/event/:id/invite", isLoggedIn, showInvitationForm);
app.post("/event/:id/invite", isLoggedIn, postInvitations);

// Search route
app.get("/result", isLoggedIn, showSearchResult);
app.post("/result", isLoggedIn, postSearch);

app.listen(PORT, () => {
  console.log(`App is listening on port ${PORT}.`);
});
