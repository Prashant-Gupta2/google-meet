# Google Meet Clone Backend

Node.js, Express, TypeScript, Sequelize, and MySQL backend foundation.

## Setup

1. Create a MySQL database named `google_meet_clone`.
2. Copy `.env.example` to `.env` and set the MySQL password.
3. Install dependencies with `npm install`.
4. Run the development server with `npm run dev`.

The API is available at `http://localhost:5000`.

## Endpoints

- `GET /health` checks that the API is running.
- `GET /health/db` checks the MySQL connection.

## Commands

- `npm run dev` starts the TypeScript development server.
- `npm run build` compiles TypeScript to `dist`.
- `npm run typecheck` runs the TypeScript checker.
- `npm start` runs the compiled server.
