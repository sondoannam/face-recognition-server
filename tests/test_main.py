import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

API_KEY = os.getenv('API_KEY', 'mysecretkey')

def load_image_bytes(filename):
    with open(os.path.join(os.path.dirname(__file__), "images", filename), "rb") as f:
        return f.read()

# Health check test (using /register as a basic check)
# def test_register_health():
#     response = client.post(
#         "/register",
#         headers={"X-API-Key": API_KEY},
#         data={"name": "test"},
#         files={"file": ("test.jpg", b"fakeimagecontent", "image/jpeg")}
#     )
#     assert response.status_code == 200
#     assert "Received registration" in response.json().get("message", "")

def test_register_one_face():
    image_bytes = load_image_bytes("one_face.jpg")
    response = client.post(
        "/register",
        headers={"X-API-Key": API_KEY},
        data={"name": "one_face"},
        files={"file": ("one_face.jpg", image_bytes, "image/jpeg")}
    )
    assert response.status_code == 200
    assert "Registered one_face successfully." in response.json().get("message", "")

def test_register_no_face():
    image_bytes = load_image_bytes("no_face.jpg")
    response = client.post(
        "/register",
        headers={"X-API-Key": API_KEY},
        data={"name": "no_face"},
        files={"file": ("no_face.jpg", image_bytes, "image/jpeg")}
    )
    assert response.status_code == 200
    assert "error" in response.json()
    assert "No face detected" in response.json()["error"]

def test_register_multiple_faces():
    image_bytes = load_image_bytes("multi_face.png")
    response = client.post(
        "/register",
        headers={"X-API-Key": API_KEY},
        data={"name": "multi_face"},
        files={"file": ("multi_face.png", image_bytes, "image/png")}
    )
    assert response.status_code == 200
    assert "error" in response.json()
    assert "Multiple faces detected" in response.json()["error"]

def test_recognize_one_face():
    image_bytes = load_image_bytes("one_face.jpg")
    response = client.post(
        "/recognize",
        headers={"X-API-Key": API_KEY},
        files={"file": ("one_face.jpg", image_bytes, "image/jpeg")}
    )
    assert response.status_code == 200
    data = response.json()
    assert "matches" in data
    assert any(match["name"] == "one_face" for match in data["matches"])

# Placeholder for future tests
def test_recognize_placeholder():
    assert True
