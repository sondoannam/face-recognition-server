# Face Recognition Server

A robust Face Recognition Server system with REST API and WebSocket capabilities for face registration and recognition.

## Quick Start (Docker Compose)

```bash
# Clone the repository
 git clone https://github.com/sondoannam/face-recognition-server.git
 cd face-recognition-server

# Start the stack (API, Database, and React Frontend)
 docker compose up -d
```

- Backend: http://localhost:8000
- React Frontend: http://localhost:5173

---

## Features

- **REST API** for quick face registration and recognition
- **WebSocket Support** for real-time face registration with multiple images
- **User Management** with database storage for user data and face encodings
- **Web Client** built with React for integration examples
- **Robust Error Handling** with comprehensive logging
- **Database Connection Pooling** for improved performance

## System Architecture

The system consists of the following components:

- **Database Layer** (`db.py`): PostgreSQL database management with connection pooling
- **REST API** (`api.py`): Face registration and recognition endpoints
- **WebSocket Server** (`ws.py`): Real-time face registration with streaming
- **Cleanup Process** (`cleanup.py`): Maintenance of cancelled registrations
- **Main Application** (`main.py`): FastAPI server setup and configuration
- **React Client** (`test-app/`): Example web client implementation

## Installation & Setup

### Option 1: Docker Compose (Recommended)

```bash
# Start the stack (API, Database, and React Frontend)
docker compose up -d

docker compose down  # To stop all services
```

This will start:

- PostgreSQL database on port 5432
- FastAPI server on port 8000
- React frontend on port 5173

To run only the database (useful for local development):

```bash
docker compose -f docker-compose.db.yml up -d
```

### Option 2: Manual Setup

#### Prerequisites

- Python 3.9+
- PostgreSQL database
- Node.js and npm/pnpm (for the web client)

#### Server Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/sondoannam/face-recognition-server.git
   cd face-recognition-server
   ```

2. Create and activate a virtual environment:

   ```bash
   python -m venv venv
   # On Linux/macOS:
   source venv/bin/activate
   # On Windows:
   venv\Scripts\activate
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Set up the PostgreSQL database:

   ```bash
   # Create a PostgreSQL database
   createdb facedb
   ```

5. Configure environment variables (create a `.env` file in the root for backend, and `test-app/.env` for frontend):

   **Backend (.env):**

   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=facedb
   DB_USER=your_username
   DB_PASS=your_password
   API_KEY=your_secure_api_key
   API_BASE_URL=http://localhost:8000
   ```

   **Frontend (test-app/.env):**

   ```
   VITE_API_BASE_URL=http://localhost:8000
   VITE_API_KEY=your_secure_api_key
   ```

6. Start the FastAPI server:

   ```bash
   uvicorn main:app --reload
   ```

7. To run the React client:
   ```bash
   cd test-app
   pnpm install
   pnpm run dev
   ```

## API Documentation

### REST API

- `POST /api/v1/register` - Register a new face with a user name
- `POST /api/v1/recognize` - Recognize a face from an image
- `GET /health` - Health check endpoint

### WebSocket

- `ws://localhost:8000/ws/register` - WebSocket endpoint for face registration

## WebSocket Protocol

The WebSocket communication follows this protocol:

### Client to Server

1. **Start Registration**:

   ```json
   { "type": "start", "name": "John Doe" }
   ```

2. **Send Image**:

   ```json
   { "type": "image", "image": "base64_encoded_image" }
   ```

3. **Finish Registration**:

   ```json
   { "type": "finish" }
   ```

4. **Cancel Registration**:
   ```json
   { "type": "stop" }
   ```

### Server to Client

1. **Info Message**:

   ```json
   {
     "type": "info",
     "message": "Registration started.",
     "registration_id": "uuid"
   }
   ```

2. **Progress Update**:

   ```json
   { "type": "progress", "count": 3 }
   ```

3. **Error Message**:

   ```json
   { "type": "error", "message": "No face detected." }
   ```

4. **Completion Message**:

   ```json
   { "type": "done", "message": "Registered John Doe with 5 images." }
   ```

5. **Cancellation Message**:
   ```json
   { "type": "stopped", "message": "Registration cancelled." }
   ```

## Maintenance Tasks

### Cleaning Up Cancelled Registrations

Run the cleanup script to remove data from cancelled registrations:

```bash
python cleanup.py
```

This script should be scheduled to run periodically if you have frequent user registrations.

## Testing

Run the test suite:

```bash
pytest tests/
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
