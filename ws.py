import uuid
import base64
import io
from fastapi import WebSocket, WebSocketDisconnect
import face_recognition
import numpy as np
from db import get_db_connection, get_db_cursor
import logging
import cv2
import os

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def websocket_register(websocket: WebSocket):
    """Handle face registration via WebSocket with better error handling"""
    await websocket.accept()
    images = []
    name = None
    registration_id = str(uuid.uuid4())
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "start":
                name = data.get("name")
                images = []
                await websocket.send_json({
                    "type": "info", 
                    "message": "Registration started.", 
                    "registration_id": registration_id
                })
            
            elif data.get("type") == "image":
                try:
                    img_b64 = data.get("image")
                    if not img_b64:
                        await websocket.send_json({
                            "type": "error", 
                            "message": "No image data received."
                        })
                        continue
                    
                    image_bytes = base64.b64decode(img_b64)
                    img = face_recognition.load_image_file(io.BytesIO(image_bytes))
                    encodings = face_recognition.face_encodings(img)
                    
                    if len(encodings) == 0:
                        await websocket.send_json({
                            "type": "error", 
                            "message": "No face detected."
                        })
                        continue
                    
                    if len(encodings) > 1:
                        await websocket.send_json({
                            "type": "error", 
                            "message": "Multiple faces detected."
                        })
                        continue
                    
                    images.append(encodings[0])
                    await websocket.send_json({
                        "type": "progress", 
                        "count": len(images)
                    })
                
                except Exception as e:
                    logger.error(f"Error processing image: {e}")
                    await websocket.send_json({
                        "type": "error", 
                        "message": f"Error processing image: {str(e)}"
                    })
            
            elif data.get("type") == "finish":
                if not name or len(images) < 5:
                    await websocket.send_json({
                        "type": "error", 
                        "message": "Not enough images or name missing."
                    })
                    continue
                
                try:
                    # Check if cancelled
                    with get_db_cursor() as cur:
                        cur.execute(
                            "SELECT 1 FROM cancel_points WHERE registration_id = %s", 
                            (registration_id,)
                        )
                        if cur.fetchone():
                            await websocket.send_json({
                                "type": "stopped", 
                                "message": "Registration was cancelled."
                            })
                            break
                    
                    # Store user and encodings within a single transaction
                    with get_db_connection() as conn:
                        with conn.cursor() as cur:
                            # Create or get user
                            cur.execute(
                                "INSERT INTO users (name) VALUES (%s) ON CONFLICT (name) DO NOTHING RETURNING id",
                                (name,)
                            )
                            result = cur.fetchone()
                            if result is None:
                                cur.execute("SELECT id FROM users WHERE name = %s", (name,))
                                result = cur.fetchone()
                                if result is None:
                                    await websocket.send_json({
                                        "type": "error", 
                                        "message": "Failed to create or retrieve user."
                                    })
                                    break
                            
                            user_id = result[0]
                            
                            # Store all face encodings
                            for encoding in images:
                                cur.execute(
                                    "INSERT INTO user_faces (user_id, face_encoding, registration_id) VALUES (%s, %s, %s)",
                                    (user_id, encoding.tobytes(), registration_id)
                                )
                    
                    await websocket.send_json({
                        "type": "done", 
                        "message": f"Registered {name} with {len(images)} images."
                    })
                    break
                    
                except Exception as e:
                    logger.error(f"Database error during registration: {e}")
                    await websocket.send_json({
                        "type": "error", 
                        "message": f"Database error: {str(e)}"
                    })
                    break
            
            elif data.get("type") == "stop":
                try:
                    # Mark as cancelled
                    with get_db_cursor() as cur:
                        cur.execute(
                            "INSERT INTO cancel_points (registration_id) VALUES (%s) ON CONFLICT DO NOTHING", 
                            (registration_id,)
                        )
                    
                    images.clear()
                    await websocket.send_json({
                        "type": "stopped", 
                        "message": "Registration cancelled and will be cleaned up."
                    })
                    break
                    
                except Exception as e:
                    logger.error(f"Error cancelling registration: {e}")
                    await websocket.send_json({
                        "type": "error", 
                        "message": f"Error cancelling registration: {str(e)}"
                    })
                    break
                    
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for registration_id: {registration_id}")
        # If disconnected during active registration, mark as cancelled
        if name and not data.get("type") == "finish":
            try:
                with get_db_cursor() as cur:
                    cur.execute(
                        "INSERT INTO cancel_points (registration_id) VALUES (%s) ON CONFLICT DO NOTHING", 
                        (registration_id,)
                    )
                logger.info(f"Marked registration as cancelled after disconnect: {registration_id}")
            except Exception as e:
                logger.error(f"Error marking registration as cancelled: {e}")
    
    except Exception as e:
        logger.error(f"Unexpected error in websocket_register: {e}")
        try:
            await websocket.send_json({
                "type": "error", 
                "message": "An unexpected error occurred."
            })
        except:
            pass  # Connection might be closed already

async def websocket_detect(websocket: WebSocket):
    """WebSocket endpoint for real-time face detection"""
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            img_b64 = data.get("image")
            if not img_b64:
                await websocket.send_json({"type": "error", "message": "No image data received."})
                continue
            try:
                image_bytes = base64.b64decode(img_b64)
                np_arr = np.frombuffer(image_bytes, np.uint8)
                img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                if img is None:
                    await websocket.send_json({"type": "error", "message": "Could not decode image."})
                    continue
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                cascade_path = os.path.join(os.path.dirname(__file__), "haarcascade_frontalface_default.xml")
                face_cascade = cv2.CascadeClassifier(cascade_path)
                faces = face_cascade.detectMultiScale(
                    gray,
                    scaleFactor=1.1,
                    minNeighbors=5,
                    minSize=(30, 30)
                )
                face_list = []
                for (x, y, w, h) in faces:
                    face_list.append({"x": int(x), "y": int(y), "width": int(w), "height": int(h)})
                await websocket.send_json({"type": "faces", "faces": face_list})
            except Exception as e:
                await websocket.send_json({"type": "error", "message": f"Detection error: {str(e)}"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logging.error(f"WebSocket detect error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": "Unexpected error."})
        except:
            pass
