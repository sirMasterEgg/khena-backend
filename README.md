# Khena Backend

Backend API project menggunakan Bun, Elysia, Drizzle ORM, dan PostgreSQL dengan arsitektur clean architecture.

## Tech Stack

- **Runtime**: Bun
- **Framework**: Elysia
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL
- **Language**: TypeScript

## Struktur Project

```
src/
  index.ts          # Entry point: setup & jalankan server Elysia
  controllers/      # HTTP request/response handling
  services/         # Business logic
  repositories/     # Database queries
  models/           # Schema Drizzle & tipe data
  routes/           # Endpoint definitions
  utils/            # Helper functions & database connection
drizzle/            # Migrations (auto-generated)
```

## Arsitektur Clean

Dependencies hanya mengalir satu arah: `routes → controllers → services → repositories → database`

- **Routes**: Mendefinisikan endpoint, meneruskan request ke controller
- **Controllers**: Menangani HTTP (parsing, validasi, format response) — TIDAK ada logika bisnis
- **Services**: Berisi logika bisnis — TIDAK berinteraksi langsung dengan HTTP atau database
- **Repositories**: Satu-satunya layer yang query database via Drizzle
- **Models**: Schema Drizzle + tipe TypeScript
- **Utils**: Helper umum, koneksi database, error handling

**Aturan penting**: Setiap layer hanya boleh memanggil layer tepat di bawahnya. Misalnya, controller dilarang memanggil repository langsung.

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Setup Environment

Copy `.env.example` menjadi `.env` dan update konfigurasi database:

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
PORT=3000
```

### 3. Setup Database & Migration

Generate migration dari schema:

```bash
bun run db:generate
```

Jalankan migration ke database:

```bash
bun run db:migrate
```

## Development

Menjalankan server dengan hot reload:

```bash
bun run dev
```

Server akan berjalan di `http://localhost:3000`

## Production

Menjalankan server:

```bash
bun run start
```

## API Endpoints

### Health Check

```
GET /health
```

Response:
```json
{ "status": "ok" }
```

### Users (Example)

```
GET    /users          # Get all users
GET    /users/:id      # Get user by ID
POST   /users          # Create user (body: { name, email })
PUT    /users/:id      # Update user (body: { name?, email? })
DELETE /users/:id      # Delete user
```

## Development Guidelines

- Ikuti struktur layer yang sudah ditentukan
- Hindari `any` type — gunakan TypeScript strict mode
- Repository satu-satunya tempat yang query database
- Service tidak boleh tahu tentang HTTP atau raw database queries
- Gunakan tipe yang di-export dari `src/models/schema.ts`
