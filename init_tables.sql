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
  event_id INTEGER NOT NULL,
  comment TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);


-- CREATE TABLE event_types (id SERIAL PRIMARY KEY, event_id INTEGER, type1_id INTEGER, type2_id INTEGER);
-- CREATE TABLE type1s (id SERIAL PRIMARY KEY, name TEXT);
-- CREATE TABLE type2s (id SERIAL PRIMARY KEY, name TEXT);