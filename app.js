import express from "express";
import pg from "pg";
import methodOverride from "method-override";
import path from "path";
import multer from "multer";
import cookieParser from "cookie-parser";
import jsSHA from "jssha";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

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

const showEvents = (req, res) => {
  res.render("events");
};

const createEvent = async (req, res) => {
  res.render("newEvent");
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
const isLoggedIn = (req, res, next) => {
  if (req.isUserLoggedIn) {
    next();
    return;
  }
  res.redirect("/login");
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
app.get("/logout", (req, res) => {
  res.clearCookie("loggedIn");
  res.clearCookie("userId");
  res.redirect("/login");
});

// Event routes
app.get("/events", isLoggedIn, showEvents);
app.get("/newEvent", isLoggedIn, createEvent);
// app.post("/newEvent", postEvent);
// app.get("/event/:id/edit", editEvent);

app.listen(PORT, () => {
  console.log(`App is listening on port ${PORT}.`);
});
