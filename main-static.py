from fastapi import FastAPI, Depends, Request, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from contextlib import asynccontextmanager
import logging
import time
from db import init_tables, pool
from api import router as api_router
from ws import websocket_register
import os
import cv2
import numpy as np
import io
from PIL import Image
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Define application lifecycle events
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    try:
        logger.info("Initializing database tables")
        init_tables()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Error during startup: {e}")
        raise

    yield  # Application runs here
    
    # Shutdown
    try:
        logger.info("Shutting down connection pool")
        if pool:
            pool.closeall()
            logger.info("Database connection pool closed")
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")

# Create FastAPI application with CORS enabled
app = FastAPI(
    lifespan=lifespan,
    title="Face Recognition API",
    description="API for registering and recognizing faces",
    version="1.0.0"
)

# Add CORS middleware to allow requests from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add request timing middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response

# Mount the static directory
app.mount("/static", StaticFiles(directory="static"), name="static")

# Root endpoint to serve the main HTML page
@app.get("/", response_class=HTMLResponse)
async def get_html():
    html_path = os.path.join("static", "index.html")
    if not os.path.exists(html_path):
        raise HTTPException(status_code=404, detail="HTML file not found")
    return FileResponse(html_path)

# Include the REST API router
app.include_router(
    api_router,
    prefix="/api/v1",
    tags=["face-recognition"]
)

# Add WebSocket endpoint
app.add_api_websocket_route("/ws/register", websocket_register)

# Add a health check endpoint
@app.get("/health", tags=["health"])
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}

# Add configuration endpoint for frontend
@app.get("/config", tags=["config"])
async def get_client_config():
    # Only expose non-sensitive configuration
    return {
        "apiKey": os.getenv("API_KEY", "mysecretkey"),  # Default value if not found
        "requiredImageCount": 5
    }

# Add face detection endpoint
@app.post("/detect")
async def detect_faces(file: UploadFile = File(...)):
    try:
        # Read image from request
        contents = await file.read()
        np_arr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        if img is None:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": "Could not decode image"}
            )
        
        # Convert to grayscale for face detection
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Load the cascade classifier
        cascade_path = os.path.join(os.path.dirname(__file__), "haarcascade_frontalface_default.xml")
        face_cascade = cv2.CascadeClassifier(cascade_path)
        
        # Detect faces
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30)
        )
        
        # Process results
        face_list = []
        for (x, y, w, h) in faces:
            face_list.append({"x": int(x), "y": int(y), "width": int(w), "height": int(h)})
        
        return {"success": True, "faces": face_list}
    
    except Exception as e:
        logging.error(f"Error in face detection: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Face detection error: {str(e)}"}
        )
