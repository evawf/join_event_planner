CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  avatar TEXT,
  about_me TEXT,
  email TEXT NOT NULL,
  hashed_password TEXT,
  created_at TIMESTAMPT WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  start_date DATE,
  start_time TIME,
  end_date DATE,
  end_time TIME,
  event_link TEXT,
  event_location TEXT,
  description TEXT,
  owner_id INTEGER,
  public BOOLEAN,
  live BOOLEAN,
  created_at TIMESTAMPT WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  comment TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE user_events (
  id SERIAL PRIMARY KEY,
  isJoin BOOLEAN,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
)

CREATE TABLE likes (
  id SERIAL PRIMARY KEY,
  liked BOOLEAN NOT NULL,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE followers (
  id SERIAL PRIMARY KEY,
  follower_id INTEGER NOT NULL REFERENCES users(id),
  followee_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
-- CREATE TABLE event_types (id SERIAL PRIMARY KEY, event_id INTEGER, type1_id INTEGER, type2_id INTEGER);
-- CREATE TABLE types (id SERIAL PRIMARY KEY, name TEXT);