CREATE TABLE users (id SERIAL PRIMARY KEY, first_name TEXT, last_name TEXT, email TEXT, password TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
