import psycopg2
import psycopg2.pool
import os
from dotenv import load_dotenv
from contextlib import contextmanager

load_dotenv()

DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = os.getenv('DB_PORT', '5432')
DB_NAME = os.getenv('DB_NAME', 'facedb')
DB_USER = os.getenv('DB_USER', 'faceuser')
DB_PASS = os.getenv('DB_PASS', 'facepass')

# Connection pool to efficiently manage database connections
pool = psycopg2.pool.SimpleConnectionPool(
    minconn=1,
    maxconn=10,
    host=DB_HOST,
    port=DB_PORT,
    dbname=DB_NAME,
    user=DB_USER,
    password=DB_PASS
)

@contextmanager
def get_db_connection():
    """Get a database connection from the pool with context management"""
    conn = pool.getconn()
    try:
        yield conn
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.commit()
        pool.putconn(conn)

@contextmanager
def get_db_cursor():
    """Get a database cursor with automatic connection management"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        try:
            yield cursor
        finally:
            cursor.close()

# Keep this for backward compatibility
def get_db_conn():
    """Legacy method to get a database connection directly"""
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASS
    )

def init_tables():
    """Initialize database tables"""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute('''
                    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
                    CREATE TABLE IF NOT EXISTS users (
                        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                        name TEXT NOT NULL UNIQUE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE TABLE IF NOT EXISTS user_faces (
                        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                        face_encoding BYTEA NOT NULL,
                        registration_id UUID,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE TABLE IF NOT EXISTS cancel_points (
                        registration_id UUID PRIMARY KEY,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                ''')
    except Exception as e:
        print(f"Error initializing tables: {e}")
        raise
