from fastapi import APIRouter, File, UploadFile, Form, Depends, HTTPException, status
from fastapi.security.api_key import APIKeyHeader
import face_recognition
import numpy as np
import uuid
import io
from db import get_db_cursor, get_db_connection
import os

router = APIRouter()

API_KEY = os.getenv('API_KEY', 'mysecretkey')
api_key_header = APIKeyHeader(name='X-API-Key')

def get_api_key(api_key: str = Depends(api_key_header)):
    if api_key != API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API Key")

@router.post("/register", dependencies=[Depends(get_api_key)])
async def register_face(name: str = Form(...), file: UploadFile = File(...)):
    try:
        image_bytes = await file.read()
        
        try:
            # Reset file position and try first method
            await file.seek(0)
            img = face_recognition.load_image_file(file.file)
        except Exception:
            # If first method fails, use bytes directly
            img = face_recognition.load_image_file(io.BytesIO(image_bytes))
        
        encodings = face_recognition.face_encodings(img)
        if len(encodings) == 0:
            return {"error": "No face detected in the image."}
        if len(encodings) > 1:
            return {"error": "Multiple faces detected. Please upload an image with a single face."}
        
        face_encoding = encodings[0]
        registration_id = str(uuid.uuid4())
        
        # Use context manager for proper resource handling
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    # Insert or get user
                    cur.execute(
                        "INSERT INTO users (name) VALUES (%s) ON CONFLICT (name) DO NOTHING RETURNING id",
                        (name,)
                    )
                    result = cur.fetchone()
                    if result is None:
                        cur.execute("SELECT id FROM users WHERE name = %s", (name,))
                        result = cur.fetchone()
                        if result is None:
                            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
                                              detail="Failed to create or retrieve user.")
                    
                    user_id = result[0]
                    
                    # Store face encoding with registration_id for consistency with WebSocket API
                    cur.execute(
                        "INSERT INTO user_faces (user_id, face_encoding, registration_id) VALUES (%s, %s, %s)",
                        (user_id, face_encoding.tobytes(), registration_id)
                    )
                    
            return {"message": f"Registered {name} successfully.", "registration_id": registration_id}
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
                              detail=f"Database error: {str(e)}")
    
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                          detail=f"Face registration failed: {str(e)}")

@router.post("/recognize", dependencies=[Depends(get_api_key)])
async def recognize_face(file: UploadFile = File(...)):
    try:
        image_bytes = await file.read()
        img = face_recognition.load_image_file(io.BytesIO(image_bytes))
        
        encodings = face_recognition.face_encodings(img)
        if len(encodings) == 0:
            return {"error": "No face detected in the image."}
        if len(encodings) > 1:
            return {"error": "Multiple faces detected. Please upload an image with a single face."}
        
        face_encoding = encodings[0]
        
        # Use context manager for database operations
        try:
            with get_db_cursor() as cur:
                cur.execute("SELECT u.id, u.name, uf.face_encoding FROM users u JOIN user_faces uf ON u.id = uf.user_id")
                users = cur.fetchall()
            
            best_match = None
            best_distance = None
            best_name = None
            best_id = None
            for user_id, name, encoding_bytes in users:
                db_encoding = np.frombuffer(encoding_bytes, dtype=np.float64)
                distance = face_recognition.face_distance([db_encoding], face_encoding)[0]
                if best_distance is None or distance < best_distance:
                    best_distance = distance
                    best_match = db_encoding
                    best_name = name
                    best_id = user_id
            
            # Threshold for match (same as compare_faces default tolerance=0.6)
            if best_distance is not None and best_distance <= 0.6:
                confidence = float(max(0, 1 - best_distance))
                return {"matches": [{"id": best_id, "name": best_name, "confidence": confidence}]}
            else:
                return {"matches": [], "message": "No match found."}
                
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                              detail=f"Database error during recognition: {str(e)}")
    
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                          detail=f"Face recognition failed: {str(e)}")
