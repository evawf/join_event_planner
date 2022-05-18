CREATE TABLE users (id SERIAL PRIMARY KEY, first_name TEXT, last_name TEXT, email TEXT, password TEXT, avatar TEXT, about_me TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE events (id SERIAL PRIMARY KEY, name TEXT, start_date DATE, start_time TIME, end_date DATE, end_time TIME, event_link TEXT, event_location TEXT, description TEXT, owner_id INTEGER);
CREATE TABLE event_types (id SERIAL PRIMARY KEY, event_id INTEGER, type1_id INTEGER, type2_id INTEGER);
CREATE TABLE type1s (id SERIAL PRIMARY KEY, name TEXT);
CREATE TABLE type2s (id SERIAL PRIMARY KEY, name TEXT);